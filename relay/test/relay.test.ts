import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { MAX_PENDING, Relay } from "../src/relay.ts";
import type { FakeDynamo } from "./fake-dynamo.ts";
import { relayOverFake } from "./fake-event.ts";

/**
 * The store underneath both doors. What matters to the user: the projection
 * reads back exactly what the app pushed however big the library is, a queued
 * word is applied at most once, and signing out leaves nothing behind.
 */

const ACCOUNT = "001234.abcdef.0001";

let store: Relay;
let table: FakeDynamo;
let now = 1_700_000_000_000;

beforeEach(() => {
  now = 1_700_000_000_000;
  ({ store, table } = relayOverFake(() => now));
});

function rows(prefix = ""): string[] {
  return [...(table as any).rows.values()]
    .filter((row: any) => row.account === ACCOUNT && String(row.sk).startsWith(prefix))
    .map((row: any) => row.sk as string);
}

describe("the projection", () => {
  it("reads back what was pushed", async () => {
    const payload = { vocab: [{ id: "1", term: "你好", translation: "hallo", lang: "zh" }], phrases: [] };
    await store.putProjection(ACCOUNT, payload);
    const read = await store.projection(ACCOUNT);
    assert.deepEqual(read?.payload, payload);
    assert.equal(read?.asOf, new Date(now).toISOString());
  });

  it("splits a library too big for one row, and stitches it back", async () => {
    // Random text does not compress, so this genuinely needs several rows.
    const vocab = Array.from({ length: 1200 }, (_, i) => ({
      id: String(i), term: randomBytes(300).toString("base64"), translation: "x", lang: "es",
    }));
    await store.putProjection(ACCOUNT, { vocab, phrases: [] });
    assert.ok(rows("projection#").length > 1, "expected more than one part");
    const read = await store.projection(ACCOUNT);
    assert.equal((read?.payload as any).vocab.length, 1200);
    assert.equal((read?.payload as any).vocab[1199].term, vocab[1199]!.term);
  });

  it("leaves no parts of the previous push behind", async () => {
    await store.putProjection(ACCOUNT, { vocab: [{ term: "a" }], phrases: [] });
    now += 1000;
    await store.putProjection(ACCOUNT, { vocab: [{ term: "b" }], phrases: [] });
    assert.equal(rows("projection#").length, 1);
    assert.equal(((await store.projection(ACCOUNT))?.payload as any).vocab[0].term, "b");
  });

  it("is null before the first push", async () => {
    assert.equal(await store.projection(ACCOUNT), null);
  });
});

describe("the queue", () => {
  it("hands each request out once, oldest first, with who asked", async () => {
    const first = await store.enqueue(ACCOUNT, "add-vocab", { items: [{ term: "uno" }] }, "Claude");
    now += 1;
    const second = await store.enqueue(ACCOUNT, "add-phrases", { items: [{ target: "¿qué tal?" }] });
    const pending = await store.pending(ACCOUNT);
    assert.deepEqual(pending.map((i) => i.id), [first!.id, second!.id]);
    assert.equal(pending[0]!.source, "Claude");
    assert.equal((pending[0] as any).sk, undefined, "table columns stay off the wire");

    assert.ok(await store.claim(ACCOUNT, first!.id));
    assert.equal(await store.claim(ACCOUNT, first!.id), null, "a second claim loses");
    assert.deepEqual((await store.pending(ACCOUNT)).map((i) => i.id), [second!.id]);
  });

  it("settles a request once, and never conjures one from a report", async () => {
    const intent = await store.enqueue(ACCOUNT, "add-vocab", { items: [] });
    await store.claim(ACCOUNT, intent!.id);
    assert.equal(await store.complete(ACCOUNT, intent!.id, { state: "applied", result: { added: 1 } }), true);
    assert.equal(await store.complete(ACCOUNT, intent!.id, { state: "failed", error: "late" }), false);
    assert.equal((await store.intent(ACCOUNT, intent!.id))?.state, "applied");
    assert.equal(await store.complete(ACCOUNT, "nope", { state: "applied", result: null }), false);
    assert.equal(await store.intent(ACCOUNT, "nope"), null);
  });

  it("gives up on a claim nobody reported back on", async () => {
    const intent = await store.enqueue(ACCOUNT, "add-vocab", { items: [] });
    await store.claim(ACCOUNT, intent!.id);
    now += 6 * 60 * 1000;
    await store.pending(ACCOUNT);
    const settled = await store.intent(ACCOUNT, intent!.id);
    assert.equal(settled?.state, "failed");
    assert.match(settled?.error ?? "", /never confirmed/);
  });

  it("fails a request the phone never came back for", async () => {
    const intent = await store.enqueue(ACCOUNT, "add-vocab", { items: [] });
    now += 8 * 24 * 60 * 60 * 1000;
    assert.deepEqual(await store.pending(ACCOUNT), []);
    assert.equal((await store.intent(ACCOUNT, intent!.id))?.state, "failed");
  });

  it(`stops taking requests at ${MAX_PENDING} waiting`, async () => {
    for (let i = 0; i < MAX_PENDING; i++) {
      now += 1;
      assert.ok(await store.enqueue(ACCOUNT, "add-vocab", { items: [] }));
    }
    assert.equal(await store.enqueue(ACCOUNT, "add-vocab", { items: [] }), null);
  });
});

describe("sessions", () => {
  it("resolve a bearer only with the right secret, and only until they expire", async () => {
    const session = await store.openSession(ACCOUNT, { kind: "agent", scopes: ["vocab:read"], clientName: "Claude" });
    const bearer = Relay.bearer(ACCOUNT, session.token);
    assert.deepEqual(await store.session(bearer), { account: ACCOUNT, kind: "agent", scopes: ["vocab:read"], clientName: "Claude" });
    assert.equal(await store.session(Relay.bearer(ACCOUNT, "wrong")), null);
    assert.equal(await store.session(session.token), null, "the account is part of the token");
    now += 181 * 24 * 60 * 60 * 1000;
    assert.equal(await store.session(bearer), null);
  });

  it("never stores a token as it was handed out", async () => {
    const session = await store.openSession(ACCOUNT, { kind: "app", scopes: [] });
    assert.ok(!JSON.stringify([...(table as any).rows.values()]).includes(session.token));
  });
});

describe("forgetting", () => {
  it("removes the projection, the queue and every session", async () => {
    await store.putProjection(ACCOUNT, { vocab: [], phrases: [] });
    await store.enqueue(ACCOUNT, "add-vocab", { items: [] });
    const session = await store.openSession(ACCOUNT, { kind: "app", scopes: ["vocab:read"] });
    await store.forget(ACCOUNT);
    assert.deepEqual(rows(), []);
    assert.equal(await store.session(Relay.bearer(ACCOUNT, session.token)), null);
  });
});
