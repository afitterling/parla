import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { claimIntent, completeIntent, forget, listIntents, pair, putProjection } from "../src/agent.ts";
import { AppleKeys, verifyIdentityToken } from "../src/apple.ts";
import { Relay } from "../src/relay.ts";
import { bearer, call, relayOverFake } from "./fake-event.ts";

/**
 * The app's door, and the Apple check in front of it. The promise worth
 * pinning: an agent's token reaches none of it, and an identity token is only
 * believed when Apple signed it for Parla.
 */

const ACCOUNT = "001234.abcdef.0001";

let store: Relay;

beforeEach(() => {
  ({ store } = relayOverFake());
});

async function appToken() {
  const session = await store.openSession(ACCOUNT, { kind: "app", scopes: ["vocab:read", "vocab:write"] });
  return Relay.bearer(ACCOUNT, session.token);
}

async function agentToken() {
  const session = await store.openSession(ACCOUNT, { kind: "agent", scopes: ["vocab:read", "vocab:write"] });
  return Relay.bearer(ACCOUNT, session.token);
}

describe("the app's door", () => {
  it("is closed to an agent's token, on every route", async () => {
    const token = await agentToken();
    for (const route of [putProjection, listIntents, claimIntent, completeIntent, pair, forget]) {
      const response = await call(route, { headers: bearer(token), path: { id: "x" }, body: {} });
      assert.equal(response.statusCode, 403);
    }
  });

  it("asks a stranger to sign in", async () => {
    const response = await call(listIntents);
    assert.equal(response.statusCode, 401);
  });

  it("takes a projection, and only one shaped like a library", async () => {
    const token = await appToken();
    assert.equal((await call(putProjection, { headers: bearer(token), body: { vocab: "no" } })).statusCode, 400);
    const ok = await call(putProjection, { headers: bearer(token), body: { vocab: [], phrases: [] } });
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.json.asOf);
  });

  it("drains the queue: list, claim once, report", async () => {
    const token = await appToken();
    const intent = await store.enqueue(ACCOUNT, "add-vocab", { items: [] }, "Claude");
    const listed = await call(listIntents, { headers: bearer(token) });
    assert.deepEqual(listed.json.intents.map((i: any) => i.id), [intent!.id]);

    assert.equal((await call(claimIntent, { headers: bearer(token), path: { id: intent!.id } })).statusCode, 200);
    assert.equal((await call(claimIntent, { headers: bearer(token), path: { id: intent!.id } })).statusCode, 409);

    const done = await call(completeIntent, {
      headers: bearer(token), path: { id: intent!.id }, body: { state: "applied", result: { added: 0, skipped: 0 } },
    });
    assert.equal(done.statusCode, 200);
    const again = await call(completeIntent, {
      headers: bearer(token), path: { id: intent!.id }, body: { state: "failed", error: "x" },
    });
    assert.equal(again.statusCode, 409);
  });

  it("mints a pairing code, read-only when asked", async () => {
    const token = await appToken();
    const response = await call(pair, { headers: bearer(token), body: { scopes: ["vocab:read"] } });
    assert.equal(response.statusCode, 201);
    assert.match(response.json.code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.deepEqual((await store.redeemPairing(response.json.code))?.scopes, ["vocab:read"]);
  });

  it("forgets the account, which signs the app out too", async () => {
    const token = await appToken();
    await store.putProjection(ACCOUNT, { vocab: [], phrases: [] });
    assert.equal((await call(forget, { headers: bearer(token) })).statusCode, 200);
    assert.equal(await store.projection(ACCOUNT), null);
    assert.equal((await call(listIntents, { headers: bearer(token) })).statusCode, 401);
  });
});

describe("Sign in with Apple", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" } as any;
  const keys = new AppleKeys({ load: async () => ({ keys: [jwk] }) });
  const now = () => 1_700_000_000_000;
  const seconds = 1_700_000_000;

  function sign(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) {
    const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body = `${segment(header)}.${segment(claims)}`;
    const signature = createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url");
    return `${body}.${signature}`;
  }

  const good = {
    iss: "https://appleid.apple.com", aud: "tech.sp33c.parla.dev", sub: ACCOUNT,
    iat: seconds - 10, exp: seconds + 600,
  };

  it("believes a token Apple signed for Parla", async () => {
    const identity = await verifyIdentityToken(sign(good), { keys, now });
    assert.equal(identity.sub, ACCOUNT);
  });

  it("refuses one signed for another app, by someone else, expired, or with alg games", async () => {
    await assert.rejects(verifyIdentityToken(sign({ ...good, aud: "tech.sp33c.shoppinglist" }), { keys, now }), /different app/);
    await assert.rejects(verifyIdentityToken(sign({ ...good, iss: "https://evil.example" }), { keys, now }), /Not issued by Apple/);
    await assert.rejects(verifyIdentityToken(sign({ ...good, exp: seconds - 3600 }), { keys, now }), /expired/);
    await assert.rejects(verifyIdentityToken(sign(good, { alg: "none", kid: "k1" }), { keys, now }), /algorithm/);
    const tampered = sign(good).split(".");
    tampered[1] = Buffer.from(JSON.stringify({ ...good, sub: "someone.else" })).toString("base64url");
    await assert.rejects(verifyIdentityToken(tampered.join("."), { keys, now }), /signature/);
  });
});
