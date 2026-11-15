import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handler, notAllowed } from "../src/mcp.ts";
import { Relay } from "../src/relay.ts";
import { bearer, call, relayOverFake } from "./fake-event.ts";

/**
 * The endpoint Claude talks to. What the user feels: reads describe their real
 * library, a write is reported as on its way rather than done, a read-only
 * connection cannot add anything however it asks, duplicates are not queued,
 * and the app's own token cannot be used as an agent's.
 */

const ACCOUNT = "001234.abcdef.0001";
const READ = "vocab:read";
const WRITE = "vocab:write";

const PROJECTION = {
  inputLanguage: "de",
  goalLanguage: "es",
  learnLanguages: ["es", "zh"],
  supported: [
    { code: "de", name: "German" },
    { code: "es", name: "Spanish" },
    { code: "zh", name: "Chinese" },
  ],
  vocab: [
    { id: "1", term: "gato", translation: "Katze", lang: "es", tags: ["animals"], createdAt: 1, reviews: 2, known: 1 },
    { id: "2", term: "perro", translation: "Hund", lang: "es", tags: ["animals"], createdAt: 2, reviews: 0, known: 0 },
    { id: "3", term: "你好", pinyin: "nǐ hǎo", translation: "hallo", lang: "zh", tags: [], createdAt: 3, reviews: 0, known: 0 },
  ],
  phrases: [
    { id: "p1", target: "¿Dónde está el baño?", translation: "Wo ist die Toilette?", lang: "es", tags: ["travel"], createdAt: 4, reviews: 0, known: 0 },
  ],
};

let store: Relay;
let now = Date.parse("2026-11-15T10:00:00Z");

beforeEach(async () => {
  ({ store } = relayOverFake(() => now));
  await store.putProjection(ACCOUNT, PROJECTION);
});

async function agent(scopes = [READ, WRITE], clientName = "Claude") {
  const session = await store.openSession(ACCOUNT, { kind: "agent", scopes, clientName });
  return Relay.bearer(ACCOUNT, session.token);
}

async function rpc(token: string | undefined, method: string, params?: unknown) {
  return call(handler, {
    headers: token ? bearer(token) : {},
    body: { jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) },
  });
}

async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  assert.equal(response.statusCode, 200);
  return response.json.result as { content: { text: string }[]; structuredContent?: any; isError?: boolean };
}

describe("connecting", () => {
  it("points a stranger at the OAuth metadata", async () => {
    const response = await rpc(undefined, "initialize");
    assert.equal(response.statusCode, 401);
    assert.match(response.headers["www-authenticate"]!, /resource_metadata="https:\/\/parla\.example\/\.well-known\/oauth-protected-resource"/);
  });

  it("does not accept the app's own session as an agent", async () => {
    const app = await store.openSession(ACCOUNT, { kind: "app", scopes: [READ, WRITE] });
    const response = await rpc(Relay.bearer(ACCOUNT, app.token), "initialize");
    assert.equal(response.statusCode, 401);
  });

  it("introduces itself and says writes are queued", async () => {
    const response = await rpc(await agent(), "initialize", { protocolVersion: "2025-06-18" });
    assert.equal(response.json.result.protocolVersion, "2025-06-18");
    assert.equal(response.json.result.serverInfo.name, "parla");
    assert.match(response.json.result.instructions, /never that they are saved/);
  });

  it("answers a notification with 202 and nothing else", async () => {
    const response = await call(handler, {
      headers: bearer(await agent()),
      body: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    assert.equal(response.statusCode, 202);
    assert.equal(response.body, "");
  });

  it("opens no stream", async () => {
    assert.equal((await call(notAllowed)).statusCode, 405);
  });
});

describe("tools/list", () => {
  it("shows a read-only connection only the reads", async () => {
    const names = (await rpc(await agent([READ]), "tools/list")).json.result.tools.map((t: any) => t.name);
    assert.deepEqual(names, ["overview", "search-vocab", "search-phrases", "request-status"]);
  });

  it("shows a writing connection the adds too, none of them destructive", async () => {
    const tools = (await rpc(await agent(), "tools/list")).json.result.tools;
    assert.ok(tools.some((t: any) => t.name === "add-vocab"));
    assert.ok(tools.every((t: any) => t.annotations.destructiveHint === false));
  });
});

describe("reading", () => {
  it("summarises the library per language", async () => {
    const answer = await tool(await agent(), "overview");
    assert.match(answer.content[0]!.text, /Speaks: German \(de\)\. Currently learning: Spanish \(es\)\./);
    assert.match(answer.content[0]!.text, /Spanish \(es\): 2 words \(1 learned\), 1 phrase\. Tags: animals \(2\), travel \(1\)/);
    assert.equal(answer.structuredContent.goalLanguage, "es");
  });

  it("searches words by language, tag, text and learned state", async () => {
    const token = await agent();
    const notLearned = await tool(token, "search-vocab", { lang: "es", learned: false });
    assert.deepEqual(notLearned.structuredContent.words.map((w: any) => w.term), ["perro"]);
    const byReading = await tool(token, "search-vocab", { query: "ni hao" });
    assert.deepEqual(byReading.structuredContent.words.map((w: any) => w.term), ["你好"]);
    const byTag = await tool(token, "search-vocab", { tag: "ANIMALS" });
    assert.equal(byTag.structuredContent.total, 2);
  });

  it("searches phrases", async () => {
    const answer = await tool(await agent(), "search-phrases", { query: "bano" });
    assert.equal(answer.structuredContent.total, 1);
  });

  it("says how old the copy is once it is old", async () => {
    now += 3 * 60 * 60 * 1000;
    const answer = await tool(await agent(), "overview");
    assert.match(answer.content[0]!.text, /last pushed its library 3 hours ago/);
  });

  it("refuses a language code Parla does not use", async () => {
    const answer = await tool(await agent(), "search-vocab", { lang: "klingon" });
    assert.equal(answer.isError, true);
  });
});

describe("adding", () => {
  it("queues new words in the learned language by default, skipping ones already there", async () => {
    const answer = await tool(await agent(), "add-vocab", {
      tags: ["lesson 3"],
      items: [
        { term: "Gato", translation: "Katze" },
        { term: "caballo", translation: "Pferd", reading: "ka-BA-jo", tags: ["animals"] },
        { term: "caballo", translation: "Pferd" },
      ],
    });
    assert.ok(!answer.isError, answer.content[0]!.text);
    assert.match(answer.content[0]!.text, /Queued 1 word \(Spanish \(es\)\) for Parla: caballo\./);
    assert.match(answer.content[0]!.text, /Already in the library, skipped: Gato\./);
    assert.match(answer.content[0]!.text, /next time the app is open/);

    const [intent] = await store.pending(ACCOUNT);
    assert.equal(intent!.operation, "add-vocab");
    assert.equal(intent!.source, "Claude");
    assert.deepEqual(intent!.arguments, {
      items: [{ term: "caballo", translation: "Pferd", pinyin: "ka-BA-jo", lang: "es", tags: ["lesson 3", "animals"] }],
    });
  });

  it("queues phrases in another language when asked", async () => {
    const answer = await tool(await agent(), "add-phrases", {
      lang: "zh",
      items: [{ text: "谢谢你", translation: "Danke dir", reading: "xièxie nǐ" }],
    });
    assert.ok(!answer.isError);
    const [intent] = await store.pending(ACCOUNT);
    assert.deepEqual(intent!.arguments, { items: [{ target: "谢谢你", translation: "Danke dir", pinyin: "xièxie nǐ", lang: "zh", tags: [] }] });
  });

  it("queues nothing when everything is already there", async () => {
    const answer = await tool(await agent(), "add-vocab", { items: [{ term: "perro", translation: "Hund" }] });
    assert.match(answer.content[0]!.text, /Nothing to add/);
    assert.deepEqual(await store.pending(ACCOUNT), []);
  });

  it("refuses items without a translation", async () => {
    const answer = await tool(await agent(), "add-vocab", { items: [{ term: "sol" }] });
    assert.equal(answer.isError, true);
    assert.match(answer.content[0]!.text, /items\[0\]\.translation is missing/);
  });

  it("will not let a read-only connection add, however it asks", async () => {
    const answer = await tool(await agent([READ]), "add-vocab", { items: [{ term: "sol", translation: "Sonne" }] });
    assert.equal(answer.isError, true);
    assert.deepEqual(await store.pending(ACCOUNT), []);
  });

  it("reports what became of a request", async () => {
    const token = await agent();
    const queued = await tool(token, "add-vocab", { items: [{ term: "sol", translation: "Sonne" }] });
    const id = queued.structuredContent.request as string;
    assert.match((await tool(token, "request-status", { request: id })).content[0]!.text, /Still waiting/);

    await store.claim(ACCOUNT, id);
    await store.complete(ACCOUNT, id, { state: "applied", result: { added: 1, skipped: 0 } });
    assert.match((await tool(token, "request-status", { request: id })).content[0]!.text, /Added to Parla: 1 new entry\./);
  });
});
