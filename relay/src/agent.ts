import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { AppleAuthError, AppleKeys, verifyIdentityToken } from "./apple.ts";
import { bad, json } from "./http.ts";
import { READ, Relay, relay, WRITE, type Session } from "./relay.ts";

/**
 * The app's door: `/v1/account` and `/v1/relay/*`.
 *
 * Parla signs in with Apple, pushes its library, drains the queue of words
 * agents asked for, and hands out pairing codes. Every route here except
 * sign-in refuses an agent's token: an agent may *ask* for words through
 * `/mcp`, but reading the queue, claiming from it, reporting on it, minting
 * pairing codes and forgetting the account are the app's alone.
 */

const keys = new AppleKeys();

export function bearerToken(event: Pick<APIGatewayProxyEventV2, "headers">): string | undefined {
  const entry = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === "authorization");
  const match = entry?.[1]?.trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function appSession(event: APIGatewayProxyEventV2, store: Relay): Promise<Session | ReturnType<typeof bad>> {
  const session = await store.session(bearerToken(event));
  if (!session) {
    return {
      ...bad(401, "Sign in first."),
      headers: { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": 'Bearer realm="parla"' },
    };
  }
  if (session.kind !== "app") return bad(403, "Only the Parla app can do this.");
  return session;
}

function isSession(value: Session | ReturnType<typeof bad>): value is Session {
  return (value as Session).account !== undefined;
}

function body<T>(event: APIGatewayProxyEventV2): T | null {
  if (!event.body) return null;
  try {
    const parsed = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** POST /v1/account — a Sign in with Apple identity token for a session. The
 *  account id is Apple's `sub`, never anything the client chose. */
export const signIn: APIGatewayProxyHandlerV2 = async (event) => {
  const request = body<{ identityToken?: string }>(event);
  if (!request?.identityToken || typeof request.identityToken !== "string") return bad(400, "Send { identityToken }.");

  let identity;
  try {
    identity = await verifyIdentityToken(request.identityToken, { keys });
  } catch (error) {
    if (error instanceof AppleAuthError) return bad(401, error.message);
    console.error("apple key fetch failed", error);
    return bad(503, "Could not reach Apple to check who you are.");
  }

  const session = await relay().openSession(identity.sub, { kind: "app", scopes: [READ, WRITE] });
  return json(200, {
    account: identity.sub,
    token: Relay.bearer(identity.sub, session.token),
    expiresAt: session.expiresAt,
  });
};

/** PUT /v1/relay/projection — the library as it is now. */
export const putProjection: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;

  const payload = body<{ vocab?: unknown; phrases?: unknown }>(event);
  if (!payload || !Array.isArray(payload.vocab) || !Array.isArray(payload.phrases)) {
    return bad(400, "Send { vocab: [], phrases: [] }.");
  }
  const stored = await store.putProjection(session.account, payload);
  return json(200, { asOf: stored.asOf });
};

/** GET /v1/relay/intents — what is waiting for this device. */
export const listIntents: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;
  return json(200, { intents: await store.pending(session.account) });
};

/** POST /v1/relay/intents/{id}/claim — at most one device applies each. */
export const claimIntent: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;
  const id = event.pathParameters?.id;
  if (!id) return bad(400, "Which intent?");
  const claimed = await store.claim(session.account, id);
  if (!claimed) return json(409, { error: "Already claimed." });
  return json(200, { intent: claimed });
};

/** POST /v1/relay/intents/{id}/complete — what the device made of it. */
export const completeIntent: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;
  const id = event.pathParameters?.id;
  if (!id) return bad(400, "Which intent?");

  const request = body<{ state?: string; result?: unknown; error?: unknown }>(event);
  let settled: boolean;
  if (request?.state === "applied") {
    settled = await store.complete(session.account, id, { state: "applied", result: request.result ?? null });
  } else if (request?.state === "failed" && typeof request.error === "string") {
    settled = await store.complete(session.account, id, { state: "failed", error: request.error.slice(0, 500) });
  } else {
    return bad(400, 'Send { state: "applied", result } or { state: "failed", error }.');
  }
  return settled ? json(200, { ok: true }) : bad(409, "That intent is unknown or already settled.");
};

/** POST /v1/relay/pairing — a code for the consent page. Read and write by
 *  default; `{ scopes: ["vocab:read"] }` mints one that can only ever read. */
export const pair: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;

  const request = body<{ scopes?: unknown }>(event);
  const asked = Array.isArray(request?.scopes) ? request.scopes.map(String) : [READ, WRITE];
  const scopes = asked.filter((scope) => scope === READ || scope === WRITE);
  if (!scopes.includes(READ)) return bad(400, `scopes must include ${READ}.`);

  const pairing = await store.createPairing(session.account, scopes);
  return json(201, { ...pairing, scopes });
};

/** DELETE /v1/relay — sign out: the projection, the queue, this session and
 *  every connected agent, gone. */
export const forget: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const session = await appSession(event, store);
  if (!isSession(session)) return session;
  return json(200, { deleted: await store.forget(session.account) });
};
