import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { authorize, approve, protectedResourceMetadata, authorizationServerMetadata, register, token } from "../src/oauth.ts";
import { Relay, useRelay } from "../src/relay.ts";
import { bearer, call, pkce, relayOverFake } from "./fake-event.ts";

/**
 * The three steps between "an agent has never heard of this account" and "an
 * agent holds a token for it": register, consent, exchange.
 *
 * What is worth pinning down is every way the flow must refuse — an unknown
 * client, a redirect the client never registered, a missing PKCE challenge, a
 * stale pairing code, a verifier that does not match — because each of those is
 * a way someone else's agent could otherwise end up reading someone's library.
 */

const ACCOUNT = "001234.abcdef.0001";
const REDIRECT = "https://agent.example/callback";
const READ = "vocab:read";
const WRITE = "vocab:write";

let store: Relay;

beforeEach(() => {
  ({ store } = relayOverFake());
  delete process.env.PUBLIC_BASE_URL;
});

async function registerClient(name = "Test Agent", uris = [REDIRECT]) {
  const response = await call(register, { body: { client_name: name, redirect_uris: uris } });
  assert.equal(response.statusCode, 201);
  return response.json.client_id as string;
}

async function pairingCode(scopes = [READ, WRITE]) {
  const { code } = await store.createPairing(ACCOUNT, scopes);
  return code;
}

describe("discovery", () => {
  it("advertises the endpoints a client needs, at the host it was asked on", async () => {
    const response = await call(authorizationServerMetadata);
    assert.equal(response.json.issuer, "https://parla.example");
    assert.equal(response.json.authorization_endpoint, "https://parla.example/oauth/authorize");
    assert.equal(response.json.token_endpoint, "https://parla.example/oauth/token");
    assert.equal(response.json.registration_endpoint, "https://parla.example/oauth/register");
    // An OAuth 2.1 public client has no other honest options.
    assert.deepEqual(response.json.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(response.json.grant_types_supported, ["authorization_code", "refresh_token"]);
  });

  it("prefers the address it was deployed under to the one in the request", async () => {
    process.env.PUBLIC_BASE_URL = "https://parla.example.org/";
    const response = await call(protectedResourceMetadata);
    assert.equal(response.json.resource, "https://parla.example.org/mcp");
    assert.deepEqual(response.json.authorization_servers, ["https://parla.example.org"]);
  });
});

describe("registration", () => {
  it("takes a client that has never been seen before", async () => {
    const response = await call(register, { body: { client_name: "Claude", redirect_uris: [REDIRECT] } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json.token_endpoint_auth_method, "none");
    assert.ok(await store.oauthClient(response.json.client_id));
  });

  it("takes loopback and private-use schemes, which native clients need", async () => {
    for (const uri of ["http://127.0.0.1:7777/cb", "http://localhost:1/cb", "cursor://anysphere.cursor/mcp"]) {
      const response = await call(register, { body: { redirect_uris: [uri] } });
      assert.equal(response.statusCode, 201, uri);
    }
  });

  it("refuses plain http to anywhere else, and refuses nothing at all", async () => {
    for (const uris of [["http://agent.example/cb"], ["javascript:alert(1)"], ["not a url"], []]) {
      const response = await call(register, { body: { redirect_uris: uris } });
      assert.equal(response.statusCode, 400, JSON.stringify(uris));
      assert.equal(response.json.error, "invalid_redirect_uri");
    }
  });
});

describe("the consent screen", () => {
  it("asks for the pairing code, carrying the request in hidden fields", async () => {
    const clientID = await registerClient("Claude");
    const { challenge } = pkce("v".repeat(64));
    const response = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: challenge, state: "xyz", scope: `${READ} ${WRITE}` },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"]!, /text\/html/);
    assert.match(response.body, /Connect Claude to Parla/);
    assert.match(response.body, /name="state" value="xyz"/);
    assert.match(response.body, new RegExp(`name="code_challenge" value="${challenge}"`));
    // Write was asked for, so it is offered — ticked, but a checkbox.
    assert.match(response.body, /name="write" type="checkbox" checked/);
  });

  it("says plainly that an agent asking only to read cannot change anything", async () => {
    const clientID = await registerClient();
    const response = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: pkce("v").challenge, scope: READ },
    });
    assert.match(response.body, /Read your library/);
    assert.doesNotMatch(response.body, /name="write"/);
  });

  it("answers an unknown client, or an unregistered redirect, as a page and not a redirect", async () => {
    const clientID = await registerClient();
    const unknown = await call(authorize, {
      query: { client_id: "nobody", redirect_uri: REDIRECT, code_challenge: "c" },
    });
    assert.equal(unknown.statusCode, 400);
    assert.match(unknown.body, /Unknown agent/);

    const elsewhere = await call(authorize, {
      query: { client_id: clientID, redirect_uri: "https://elsewhere.example/cb", code_challenge: "c" },
    });
    assert.equal(elsewhere.statusCode, 400);
    assert.equal(elsewhere.headers.location, undefined);
  });

  it("sends the client's own protocol mistakes back to the client", async () => {
    const clientID = await registerClient();
    const noPKCE = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, state: "xyz" },
    });
    assert.equal(noPKCE.statusCode, 303);
    const location = new URL(noPKCE.headers.location!);
    assert.equal(location.origin + location.pathname, REDIRECT);
    assert.equal(location.searchParams.get("error"), "invalid_request");
    assert.equal(location.searchParams.get("state"), "xyz");

    const madeUpScope = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: "c", scope: "vocab:burn" },
    });
    assert.equal(new URL(madeUpScope.headers.location!).searchParams.get("error"), "invalid_scope");
  });
});

describe("approving", () => {
  const challenge = pkce("verifier-that-is-long-enough-to-be-real").challenge;

  function form(code: string, extra: Record<string, string> = {}) {
    return {
      client_id: "",
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      scope: `${READ} ${WRITE}`,
      state: "xyz",
      code,
      ...extra,
    };
  }

  it("turns a pairing code into an authorization code on the client's redirect", async () => {
    const clientID = await registerClient();
    const code = await pairingCode();

    const response = await call(approve, { form: form(code, { client_id: clientID, write: "on" }) });
    assert.equal(response.statusCode, 303);
    const location = new URL(response.headers.location!);
    assert.equal(location.searchParams.get("state"), "xyz");
    assert.ok(location.searchParams.get("code"));
    assert.equal(location.searchParams.get("error"), null);
  });

  it("re-asks rather than redirecting when the code is wrong or stale", async () => {
    const clientID = await registerClient();
    const response = await call(approve, { form: form("ZZZZZZZZ", { client_id: clientID }) });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /expired or has already been used/);
    assert.equal(response.headers.location, undefined);
  });

  it("spends a pairing code exactly once", async () => {
    const clientID = await registerClient();
    const code = await pairingCode();
    const first = await call(approve, { form: form(code, { client_id: clientID, write: "on" }) });
    assert.equal(first.statusCode, 303);

    const second = await call(approve, { form: form(code, { client_id: clientID, write: "on" }) });
    assert.equal(second.statusCode, 200);
    assert.match(second.body, /expired or has already been used/);
  });

  it("grants nothing the user did not leave ticked", async () => {
    const clientID = await registerClient();
    const code = await pairingCode();
    // The checkbox is absent from the form when it is unticked.
    const response = await call(approve, { form: form(code, { client_id: clientID }) });
    const authCode = new URL(response.headers.location!).searchParams.get("code")!;

    const granted = await exchange(clientID, authCode, "verifier-that-is-long-enough-to-be-real");
    assert.equal(granted.json.scope, READ);
  });

  it("grants nothing the app's pairing did not allow, however the box is ticked", async () => {
    const clientID = await registerClient();
    // The app handed out a read-only pairing; the consent screen cannot widen it.
    const code = await pairingCode([READ]);
    const response = await call(approve, { form: form(code, { client_id: clientID, write: "on" }) });
    const authCode = new URL(response.headers.location!).searchParams.get("code")!;

    const granted = await exchange(clientID, authCode, "verifier-that-is-long-enough-to-be-real");
    assert.equal(granted.json.scope, READ);
  });
});

describe("there is no delete permission", () => {
  it("refuses a scope that would let an agent remove words", async () => {
    const clientID = await registerClient("Claude");
    const response = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: "c", scope: `${READ} vocab:delete` },
    });
    assert.equal(response.statusCode, 303);
    assert.equal(new URL(response.headers.location!).searchParams.get("error"), "invalid_scope");
  });

  it("does not offer a delete box on the consent page", async () => {
    const clientID = await registerClient("Claude");
    const response = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: "c", scope: `${READ} ${WRITE}` },
    });
    assert.match(response.body, /name="write" type="checkbox" checked/);
    assert.doesNotMatch(response.body, /destroy/);
  });

  it("cannot be framed by another site", async () => {
    const clientID = await registerClient("Claude");
    const response = await call(authorize, {
      query: { client_id: clientID, redirect_uri: REDIRECT, code_challenge: "c" },
    });
    assert.match(response.headers["content-security-policy"]!, /frame-ancestors 'none'/);
  });
});

function exchange(clientID: string, code: string, verifier: string) {
  return call(token, {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: clientID,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    },
  });
}

describe("the token endpoint", () => {
  const verifier = "a-verifier-long-enough-to-be-worth-something";

  async function authorized(scopes = [READ, WRITE], write = true) {
    const clientID = await registerClient();
    const code = await pairingCode(scopes);
    const response = await call(approve, {
      form: {
        client_id: clientID,
        redirect_uri: REDIRECT,
        code_challenge: pkce(verifier).challenge,
        scope: scopes.join(" "),
        code,
        ...(write ? { write: "on" } : {}),
      },
    });
    return { clientID, code: new URL(response.headers.location!).searchParams.get("code")! };
  }

  it("hands back a token that resolves to the paired account", async () => {
    const { clientID, code } = await authorized();
    const response = await exchange(clientID, code, verifier);

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.token_type, "Bearer");
    assert.ok(response.json.expires_in > 0);
    const session = await store.session(response.json.access_token);
    assert.equal(session?.account, ACCOUNT);
    assert.equal(session?.kind, "agent");
    assert.deepEqual(session?.scopes, [READ, WRITE]);
  });

  it("refuses a verifier that does not match the challenge", async () => {
    const { clientID, code } = await authorized();
    const response = await exchange(clientID, code, "not-the-verifier");
    assert.equal(response.statusCode, 400);
    assert.equal(response.json.error, "invalid_grant");
  });

  it("refuses a code presented by a different client, or to a different address", async () => {
    const { code } = await authorized();
    const other = await registerClient("Someone Else");
    assert.equal((await exchange(other, code, verifier)).json.error, "invalid_grant");

    const { clientID, code: second } = await authorized();
    const elsewhere = await call(token, {
      form: {
        grant_type: "authorization_code", code: second, client_id: clientID,
        redirect_uri: "https://elsewhere.example/cb", code_verifier: verifier,
      },
    });
    assert.equal(elsewhere.json.error, "invalid_grant");
  });

  it("spends an authorization code once", async () => {
    const { clientID, code } = await authorized();
    assert.equal((await exchange(clientID, code, verifier)).statusCode, 200);
    assert.equal((await exchange(clientID, code, verifier)).json.error, "invalid_grant");
  });

  it("accepts the exchange without redirect_uri, as OAuth 2.1 allows with PKCE", async () => {
    const { clientID, code } = await authorized();
    const response = await call(token, {
      form: { grant_type: "authorization_code", code, client_id: clientID, code_verifier: verifier },
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json.access_token);
  });

  it("still refuses a redirect_uri that is sent and does not match", async () => {
    const { clientID, code } = await authorized();
    const response = await call(token, {
      form: {
        grant_type: "authorization_code", code, client_id: clientID,
        redirect_uri: "https://elsewhere.example/cb", code_verifier: verifier,
      },
    });
    assert.equal(response.json.error, "invalid_grant");
  });

  it("accepts a JSON body", async () => {
    const { clientID, code } = await authorized();
    const response = await call(token, {
      headers: { "content-type": "application/json" },
      body: { grant_type: "authorization_code", code, client_id: clientID, redirect_uri: REDIRECT, code_verifier: verifier },
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json.access_token);
  });

  it("takes client_id from HTTP Basic auth when the body leaves it out", async () => {
    const { clientID, code } = await authorized();
    const response = await call(token, {
      headers: { authorization: `Basic ${Buffer.from(`${clientID}:`).toString("base64")}` },
      form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier },
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json.access_token);
  });

  it("refuses a grant it does not know", async () => {
    const response = await call(token, { form: { grant_type: "client_credentials" } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json.error, "unsupported_grant_type");
  });
});

describe("refreshing", () => {
  const verifier = "a-verifier-long-enough-to-be-worth-something";
  const LIFETIME = 180 * 24 * 60 * 60;

  async function pair(clientID?: string) {
    clientID ??= await registerClient();
    const code = await pairingCode();
    const approved = await call(approve, {
      form: {
        client_id: clientID, redirect_uri: REDIRECT, code_challenge: pkce(verifier).challenge,
        scope: `${READ} ${WRITE}`, code, write: "on",
      },
    });
    const response = await exchange(clientID, new URL(approved.headers.location!).searchParams.get("code")!, verifier);
    assert.equal(response.statusCode, 200);
    return { clientID, ...response.json as { access_token: string; refresh_token: string; expires_in: number } };
  }

  function refreshWith(clientID: string, refreshToken: string, extra: Record<string, string> = {}) {
    return call(token, { form: { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientID, ...extra } });
  }

  it("hands out a long access token with a refresh token beside it", async () => {
    const issued = await pair();
    assert.equal(issued.expires_in, LIFETIME);
    assert.ok(issued.refresh_token);
    assert.notEqual(issued.refresh_token, issued.access_token);
  });

  it("trades a refresh token for a fresh pair, and retires the old pair", async () => {
    const issued = await pair();
    const renewed = await refreshWith(issued.clientID, issued.refresh_token);

    assert.equal(renewed.statusCode, 200);
    assert.equal(renewed.json.expires_in, LIFETIME);
    assert.equal(renewed.json.scope, `${READ} ${WRITE}`);
    assert.notEqual(renewed.json.access_token, issued.access_token);
    assert.notEqual(renewed.json.refresh_token, issued.refresh_token);
    assert.equal((await store.session(renewed.json.access_token))?.account, ACCOUNT);
    // The old access token went with the old refresh token.
    assert.equal(await store.session(issued.access_token), null);
    // And the old refresh token is spent.
    assert.equal((await refreshWith(issued.clientID, issued.refresh_token)).json.error, "invalid_grant");
  });

  it("refuses a refresh token presented by a different client", async () => {
    const issued = await pair();
    const other = await registerClient("Someone Else");
    const response = await refreshWith(other, issued.refresh_token);
    assert.equal(response.statusCode, 400);
    assert.equal(response.json.error, "invalid_grant");
    // Presenting it wrongly spends it all the same.
    assert.equal((await refreshWith(issued.clientID, issued.refresh_token)).json.error, "invalid_grant");
  });

  it("lets a refresh narrow the scope, never widen it", async () => {
    const issued = await pair();
    const wider = await refreshWith(issued.clientID, issued.refresh_token, { scope: `${READ} ${WRITE} vocab:delete` });
    assert.equal(wider.json.error, "invalid_scope");

    const again = await pair();
    const narrower = await refreshWith(again.clientID, again.refresh_token, { scope: READ });
    assert.equal(narrower.statusCode, 200);
    assert.equal(narrower.json.scope, READ);
    assert.deepEqual((await store.session(narrower.json.access_token))?.scopes, [READ]);
  });

  it("renews before the end, and lets both halves lapse together", async () => {
    let clock = 1_700_000_000_000;
    ({ store } = relayOverFake(() => clock));
    const issued = await pair();

    clock += 170 * 24 * 60 * 60 * 1000;
    assert.equal((await store.session(issued.access_token))?.account, ACCOUNT);
    const renewed = await refreshWith(issued.clientID, issued.refresh_token);
    assert.equal(renewed.statusCode, 200);
    assert.equal((await store.session(renewed.json.access_token))?.account, ACCOUNT);

    // Past the lifetime, neither the access token nor the refresh token is any use.
    clock += (LIFETIME + 1) * 1000;
    assert.equal(await store.session(renewed.json.access_token), null);
    assert.equal((await refreshWith(issued.clientID, renewed.json.refresh_token)).json.error, "invalid_grant");
  });

  it("needs the token and the client, and nothing else", async () => {
    const response = await call(token, { form: { grant_type: "refresh_token" } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json.error, "invalid_request");
  });
});
