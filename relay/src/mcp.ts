import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { bearerToken } from "./agent.ts";
import { resourceURL } from "./oauth.ts";
import {
  fold, freshness, languageName, normalise, overview, plural, renderOverview, renderPhrases, renderWords,
  searchPhrases, searchWords, wordKey,
  type Filter, type ParlaProjection,
} from "./projection.ts";
import { MAX_PENDING, READ, relay, WRITE, type IntentOperation, type Relay, type Session } from "./relay.ts";

/**
 * The hosted MCP endpoint Claude connects to.
 *
 * Streamable HTTP in its JSON mode: one JSON-RPC message in, one JSON object
 * out, no SSE stream and no session. `GET`/`DELETE /mcp` answer 405, which is
 * what the transport specifies for a server that opens no stream. Every
 * request carries its bearer token, so any Lambda can answer any request.
 *
 * Reads are answered from the projection. Writes are queued, and Parla on the
 * user's iPhone adds them the next time it is open — so every write answer
 * says the words are *on their way*, never that they are saved.
 *
 * Shape follows `shopping-list/backend/src/mcp.ts`.
 */

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const MAX_ITEMS = 100;
const MAX_TAGS = 10;
const LANG_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

interface Context {
  store: Relay;
  session: Session;
  now: number;
  projection(): Promise<{ payload: ParlaProjection; asOf: string | null }>;
}

interface ToolResult {
  text: string;
  data?: unknown;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  writes: boolean;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, context: Context): Promise<ToolResult>;
}

class Refused extends Error {}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});

const langProp = {
  type: "string",
  description: "Language code as Parla stores it: ISO 639-1 such as \"es\", \"ja\", \"th\", or \"zh-TW\" for Traditional Chinese and \"yue\" for Cantonese. " +
    "Call `overview` to see the learner's languages.",
};
const tagsProp = {
  type: "array",
  items: { type: "string" },
  description: `Up to ${MAX_TAGS} tags, e.g. a topic ("travel", "food") or the name of the agent or lesson the words came from. They become filters in Parla.`,
};

const filterProps = {
  lang: { ...langProp, description: "Only this language." },
  tag: { type: "string", description: "Only entries carrying this tag (case-insensitive)." },
  query: { type: "string", description: "Substring to look for in the entry, its translation or its reading. Accents and case are ignored." },
  limit: { type: "integer", minimum: 1, maximum: 200, description: "How many to return (default 50)." },
  offset: { type: "integer", minimum: 0, description: "Skip this many, for paging (default 0)." },
};

const TOOLS: Tool[] = [
  {
    name: "overview",
    title: "Library overview",
    description:
      "The learner's languages: which language they speak, which they are learning, and per language how many words " +
      "and phrases are saved, how many words are learned, and the most used tags. Start here.",
    writes: false,
    inputSchema: object({}),
    async run(_args, context) {
      const { payload, asOf } = await context.projection();
      return {
        text: say(renderOverview(payload), asOf, context),
        data: {
          asOf,
          inputLanguage: payload.inputLanguage,
          goalLanguage: payload.goalLanguage,
          learnLanguages: payload.learnLanguages,
          languages: overview(payload),
        },
      };
    },
  },

  {
    name: "search-vocab",
    title: "Search words",
    description:
      "Words in the learner's vocabulary, newest first, with reading aid, translation, tags and whether they are learned. " +
      "Filter by language, tag, text or learned state. Use it before suggesting words, so you do not offer what they already have.",
    writes: false,
    inputSchema: object({
      ...filterProps,
      learned: { type: "boolean", description: "true: only words answered correctly at least once. false: only words not learned yet." },
    }),
    async run(args, context) {
      const { payload, asOf } = await context.projection();
      const filter = readFilter(args, payload);
      const found = searchWords(payload, filter);
      return { text: say(renderWords(found, filter), asOf, context), data: { asOf, ...found } };
    },
  },

  {
    name: "search-phrases",
    title: "Search phrases",
    description: "Whole phrases and sentences the learner saved, newest first. Same filters as search-vocab.",
    writes: false,
    inputSchema: object(filterProps),
    async run(args, context) {
      const { payload, asOf } = await context.projection();
      const filter = readFilter(args, payload);
      const found = searchPhrases(payload, filter);
      return { text: say(renderPhrases(found, filter), asOf, context), data: { asOf, ...found } };
    },
  },

  {
    name: "add-vocab",
    title: "Add words",
    description:
      "Asks Parla to add words to the learner's vocabulary. Write the term in the language being learned and the " +
      "translation in the language the learner speaks (see `overview`). Give a reading aid (pinyin, romaji, " +
      "romanisation) for non-Latin scripts, and an example sentence when it helps. Words already in the library are skipped. " +
      "Queued, not saved: Parla adds them on the user's iPhone the next time the app is open, so tell the user " +
      "they are on their way, not that they are saved.",
    writes: true,
    inputSchema: object({
      lang: { ...langProp, description: "Language of every item that does not name its own. Defaults to the language currently being learned." },
      tags: { ...tagsProp, description: "Tags for every item, added to each item's own." },
      items: {
        type: "array",
        minItems: 1,
        maxItems: MAX_ITEMS,
        items: object({
          term: { type: "string", description: "The word or expression in the language being learned." },
          translation: { type: "string", description: "Its meaning in the language the learner speaks." },
          reading: { type: "string", description: "Reading aid: pinyin with tone marks, romaji, RTGS, etc." },
          example: { type: "string", description: "A short example sentence using the term, in the language being learned." },
          exampleReading: { type: "string", description: "Reading aid for the example." },
          exampleTranslation: { type: "string", description: "The example in the language the learner speaks." },
          lang: langProp,
          tags: tagsProp,
        }, ["term", "translation"]),
      },
    }, ["items"]),
    async run(args, context) {
      const { payload, asOf } = await context.projection();
      const defaults = readDefaults(args, payload);
      const raw = readItems(args);
      const have = new Set(payload.vocab.map((w) => wordKey(w.lang, w.term)));
      const queued: Record<string, unknown>[] = [];
      const skipped: string[] = [];
      const batch = new Set<string>();
      for (const [index, item] of raw.entries()) {
        const term = need(item.term, 200, `items[${index}].term`);
        const translation = need(item.translation, 500, `items[${index}].translation`);
        const lang = readLang(item.lang, payload) ?? defaults.lang;
        const key = wordKey(lang, term);
        if (have.has(key)) {
          skipped.push(term);
          continue;
        }
        // Twice in one request is not "already in the library": drop quietly.
        if (batch.has(key)) continue;
        batch.add(key);
        queued.push(compact({
          term,
          translation,
          pinyin: maybe(item.reading, 300),
          example: maybe(item.example, 1000),
          examplePinyin: maybe(item.exampleReading, 1500),
          exampleTranslation: maybe(item.exampleTranslation, 1000),
          lang,
          tags: mergeTags(defaults.tags, readTags(item.tags)),
        }));
      }
      return queue(context, "add-vocab", queued, skipped, asOf, payload, (item) => String(item.term));
    },
  },

  {
    name: "add-phrases",
    title: "Add phrases",
    description:
      "Asks Parla to add whole phrases or sentences to the learner's phrase list — expressions worth learning as a unit. " +
      "Same rules as add-vocab: phrases already saved are skipped, and they are queued for the user's iPhone, not saved yet.",
    writes: true,
    inputSchema: object({
      lang: { ...langProp, description: "Language of every item that does not name its own. Defaults to the language currently being learned." },
      tags: { ...tagsProp, description: "Tags for every item, added to each item's own." },
      items: {
        type: "array",
        minItems: 1,
        maxItems: MAX_ITEMS,
        items: object({
          text: { type: "string", description: "The phrase in the language being learned." },
          translation: { type: "string", description: "Its meaning in the language the learner speaks." },
          reading: { type: "string", description: "Reading aid for non-Latin scripts." },
          lang: langProp,
          tags: tagsProp,
        }, ["text", "translation"]),
      },
    }, ["items"]),
    async run(args, context) {
      const { payload, asOf } = await context.projection();
      const defaults = readDefaults(args, payload);
      const raw = readItems(args);
      const have = new Set(payload.phrases.map((p) => wordKey(p.lang, p.target)));
      const queued: Record<string, unknown>[] = [];
      const skipped: string[] = [];
      const batch = new Set<string>();
      for (const [index, item] of raw.entries()) {
        const target = need(item.text, 1000, `items[${index}].text`);
        const translation = need(item.translation, 1000, `items[${index}].translation`);
        const lang = readLang(item.lang, payload) ?? defaults.lang;
        const key = wordKey(lang, target);
        if (have.has(key)) {
          skipped.push(target);
          continue;
        }
        // Twice in one request is not "already in the library": drop quietly.
        if (batch.has(key)) continue;
        batch.add(key);
        queued.push(compact({
          target,
          translation,
          pinyin: maybe(item.reading, 1500),
          lang,
          tags: mergeTags(defaults.tags, readTags(item.tags)),
        }));
      }
      return queue(context, "add-phrases", queued, skipped, asOf, payload, (item) => String(item.target));
    },
  },

  {
    name: "request-status",
    title: "Did it arrive?",
    description: "Whether a request from add-vocab or add-phrases has been added by Parla yet, and what came of it.",
    writes: false,
    inputSchema: object({ request: { type: "string", description: "The request id add-vocab or add-phrases answered with." } }, ["request"]),
    async run(args, context) {
      const id = typeof args.request === "string" ? args.request.trim() : "";
      if (!id) throw new Refused("Pass the request id.");
      const intent = await context.store.intent(context.session.account, id);
      if (!intent) throw new Refused("No request by that id. Requests are forgotten a week after they are settled.");
      const result = intent.result as { added?: number; skipped?: number } | undefined;
      const text = intent.state === "applied"
        ? `Added to Parla${result?.added !== undefined ? `: ${plural(result.added, "new entry")}${result.skipped ? `, ${result.skipped} already there` : ""}` : ""}.`
        : intent.state === "failed"
          ? `Not added: ${intent.error ?? "Parla refused it."}`
          : "Still waiting for Parla to be opened on the iPhone.";
      return { text, data: { request: intent.id, state: intent.state, result: intent.result, error: intent.error } };
    },
  },
];

// --- Tool plumbing -----------------------------------------------------------

function readFilter(args: Record<string, unknown>, payload: ParlaProjection): Filter {
  const limit = Number.isInteger(args.limit) ? Math.min(200, Math.max(1, args.limit as number)) : 50;
  const offset = Number.isInteger(args.offset) ? Math.max(0, args.offset as number) : 0;
  return {
    lang: readLang(args.lang, payload),
    tag: maybe(args.tag, 100),
    query: maybe(args.query, 200),
    learned: typeof args.learned === "boolean" ? args.learned : undefined,
    limit,
    offset,
  };
}

function readLang(value: unknown, payload: ParlaProjection): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !LANG_CODE.test(value.trim())) {
    throw new Refused(`"${String(value)}" is not a language code Parla uses. Use codes like "es", "ja" or "zh-TW".`);
  }
  const code = value.trim();
  if (payload.supported.length > 0 && !payload.supported.some((l) => l.code === code)) {
    throw new Refused(`Parla has no language "${code}".`);
  }
  return code;
}

function readDefaults(args: Record<string, unknown>, payload: ParlaProjection): { lang: string; tags: string[] } {
  const lang = readLang(args.lang, payload) ?? payload.goalLanguage ?? undefined;
  if (!lang) throw new Refused("Say which language these are in: pass lang (Parla has not told the relay which language is being learned).");
  return { lang, tags: readTags(args.tags) };
}

function readItems(args: Record<string, unknown>): Record<string, unknown>[] {
  const items = Array.isArray(args.items) ? args.items : [];
  if (items.length === 0) throw new Refused("Pass at least one item.");
  if (items.length > MAX_ITEMS) throw new Refused(`At most ${MAX_ITEMS} items per request; split the rest into another call.`);
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Refused(`items[${index}] must be an object.`);
    return item as Record<string, unknown>;
  });
}

function readTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Refused("tags must be a list of strings.");
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/^#/, "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

function mergeTags(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (const tag of [...a, ...b]) if (!out.some((t) => fold(t) === fold(tag))) out.push(tag);
  return out.slice(0, MAX_TAGS);
}

function need(value: unknown, max: number, field: string): string {
  const out = typeof value === "string" ? value.trim() : "";
  if (!out) throw new Refused(`${field} is missing.`);
  if (out.length > max) throw new Refused(`${field} is longer than ${max} characters.`);
  return out;
}

function maybe(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const out = value.trim();
  return out ? out.slice(0, max) : undefined;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

async function queue(
  context: Context,
  operation: IntentOperation,
  items: Record<string, unknown>[],
  skipped: string[],
  asOf: string | null,
  payload: ParlaProjection,
  label: (item: Record<string, unknown>) => string,
): Promise<ToolResult> {
  const noun = operation === "add-vocab" ? "word" : "phrase";
  const skippedNote = skipped.length > 0 ? `Already in the library, skipped: ${skipped.join(", ")}.` : "";
  if (items.length === 0) {
    return { text: `Nothing to add. ${skippedNote}`.trim(), data: { request: null, queued: 0, skipped } };
  }
  const intent = await context.store.enqueue(context.session.account, operation, { items }, context.session.clientName);
  if (!intent) {
    throw new Refused(`${MAX_PENDING} requests are already waiting for Parla to be opened. Ask the user to open Parla on their iPhone first.`);
  }
  const langs = [...new Set(items.map((item) => String(item.lang)))].map((l) => languageName(payload, l)).join(", ");
  const text = [
    `Queued ${plural(items.length, noun)} (${langs}) for Parla: ${items.map(label).join(", ")}.`,
    skippedNote,
    `Parla adds them on the user's iPhone the next time the app is open. Request id: ${intent.id}.`,
    asOf ? "" : "Parla has not pushed its library yet, so duplicates could not be checked here; the app checks again.",
  ].filter(Boolean).join(" ");
  return { text, data: { request: intent.id, state: intent.state, queued: items.length, skipped } };
}

/** Every read carries how old it is when that is worth saying. */
function say(text: string, asOf: string | null, context: Context): string {
  const note = freshness(asOf, context.now);
  return note ? `${text}\n${note}` : text;
}

// --- The endpoint --------------------------------------------------------------

/** POST /mcp */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await store.session(bearerToken(event));
  if (!session || session.kind !== "agent") return unauthorized(event);
  if (!session.scopes.includes(READ)) {
    return http(403, { error: "This connection is not allowed to read your library." });
  }

  let message: unknown;
  try {
    const text = event.body
      ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body)
      : "";
    message = JSON.parse(text);
  } catch {
    return http(400, error(null, -32700, "That is not JSON."));
  }

  const context = makeContext(store, session);
  if (Array.isArray(message)) {
    const answers = (await Promise.all(message.map((one) => respond(one, context)))).filter((a) => a !== null);
    return answers.length === 0 ? accepted() : http(200, answers);
  }
  const answer = await respond(message, context);
  return answer === null ? accepted() : http(200, answer);
};

/** GET and DELETE /mcp: no stream, no session. */
export const notAllowed: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 405,
  headers: { "content-type": "application/json", "cache-control": "no-store", allow: "POST" },
  body: JSON.stringify({ error: "This MCP endpoint answers POST only: it opens no streams and keeps no sessions." }),
});

function makeContext(store: Relay, session: Session): Context {
  let loaded: Promise<{ payload: ParlaProjection; asOf: string | null }> | undefined;
  return {
    store,
    session,
    now: store.clock,
    projection() {
      loaded ??= store.projection(session.account).then((stored) => ({
        payload: normalise(stored?.payload),
        asOf: stored?.asOf ?? null,
      }));
      return loaded;
    },
  };
}

async function respond(message: unknown, context: Context): Promise<unknown | null> {
  const request = message as { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
  const id = request?.id ?? null;
  if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return error(id, -32600, "Every message needs jsonrpc: \"2.0\" and a method.");
  }
  const isNotification = request.id === undefined || request.id === null;
  const visible = TOOLS.filter((tool) => !tool.writes || context.session.scopes.includes(WRITE));

  switch (request.method) {
    case "initialize": {
      const asked = request.params?.protocolVersion;
      const version = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0]!;
      return result(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "parla", title: "Parla", version: "1.0.0" },
        instructions:
          "The user's Parla language-learning library: the words and phrases they are learning, in which languages, " +
          "with tags and learned state. Call `overview` first to learn which language they speak (translations go in " +
          "that one) and which they are learning. Reads come from the copy Parla last pushed and say how old it is when " +
          "that matters. add-vocab and add-phrases do not save anything directly: they queue the entries, and Parla adds " +
          "them on the user's iPhone the next time the app is open, skipping duplicates. Tell the user new words are on " +
          "their way, never that they are saved. Check search-vocab before suggesting words so you do not repeat ones " +
          "they already have, and tag what you add with its topic or lesson so the user can find and quiz it.",
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: visible.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            title: tool.title,
            readOnlyHint: !tool.writes,
            destructiveHint: false,
            idempotentHint: !tool.writes,
            openWorldHint: false,
          },
        })),
      });

    case "tools/call": {
      const name = request.params?.name;
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (!tool) return result(id, failed(`There's no "${String(name)}" tool.`));
      if (tool.writes && !context.session.scopes.includes(WRITE)) {
        return result(id, failed("This connection may only read the library. Reconnect and tick \"Let it add words and phrases\" to allow adding."));
      }
      try {
        const answer = await tool.run((request.params?.arguments ?? {}) as Record<string, unknown>, context);
        return result(id, {
          content: [{ type: "text", text: answer.text }],
          ...(answer.data === undefined ? {} : { structuredContent: answer.data as Record<string, unknown> }),
        });
      } catch (thrown) {
        if (thrown instanceof Refused) return result(id, failed(thrown.message));
        console.error("tool failed", name, thrown);
        return result(id, failed("Something went wrong reaching the library. Try again in a moment."));
      }
    }

    default:
      return isNotification ? null : error(id, -32601, `This server has no "${request.method}".`);
  }
}

function failed(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

function result(id: string | number | null, value: unknown) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function http(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

function accepted(): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 202, headers: { "cache-control": "no-store" }, body: "" };
}

/** The 401 that starts an OAuth flow: `resource_metadata` tells a client that
 *  has never seen this server where to authorize (RFC 9728). */
function unauthorized(event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 {
  const metadata = `${resourceURL(event).replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource`;
  return {
    statusCode: 401,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "www-authenticate": `Bearer realm="parla", resource_metadata="${metadata}"`,
    },
    body: JSON.stringify({ error: "Connect this agent to Parla first." }),
  };
}
