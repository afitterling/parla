import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { bad, json } from "./http.ts";
import { READ, Relay, relay, SUPPORTED_SCOPES, WRITE } from "./relay.ts";

/**
 * The authorization server a remote MCP client (claude.ai, Claude Code, Claude
 * Desktop) talks to: OAuth 2.1, PKCE `S256` only, open dynamic registration.
 *
 *  1. the client registers itself (RFC 7591);
 *  2. the user is sent here in a browser and proves who they are by typing the
 *     pairing code Parla shows under Settings → Claude & agents;
 *  3. the code comes back through the redirect and is exchanged, with the PKCE
 *     verifier, for a bearer token scoped to that one account.
 *
 * The identity is Sign in with Apple — done by the app, not by this page. The
 * pairing code carries it across: minted by an app that is signed in, ten
 * minutes, single use.
 *
 * Ported from `shopping-list/backend/src/oauth.ts`; scopes, wording and the
 * consent page are Parla's, and there is no delete scope to grant.
 */

const SUPPORTED = SUPPORTED_SCOPES;

/** Where this deployment thinks it lives. Every URL it advertises has to agree
 *  with the one the client actually dialled, or the metadata is useless. */
function baseURL(event: APIGatewayProxyEventV2): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const host = header(event, "host") ?? event.requestContext?.domainName;
  return `https://${host}`;
}

function header(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const entry = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return entry?.[1]?.trim() || undefined;
}

/** The canonical identifier of the thing being protected: the MCP endpoint. */
export function resourceURL(event: APIGatewayProxyEventV2): string {
  return `${baseURL(event)}/mcp`;
}

// --- Discovery -------------------------------------------------------------

/**
 * RFC 8414. Handed to a client that has been told, by a `401`, where to look.
 *
 * `code` is the only response type and `S256` the only challenge method: an
 * OAuth 2.1 public client has no other honest options, and advertising the
 * plain challenge would let a client pick it.
 */
export const authorizationServerMetadata: APIGatewayProxyHandlerV2 = async (event) => {
  const base = baseURL(event);
  return cacheable({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: SUPPORTED,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
      });
};

/** RFC 9728, the other half: what this resource is and who vouches for it. */
export const protectedResourceMetadata: APIGatewayProxyHandlerV2 = async (event) => {
  const base = baseURL(event);
  return cacheable({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: SUPPORTED,
    bearer_methods_supported: ["header"],
  });
};

/** Discovery documents are the one thing here worth caching: they are the same
 *  for everyone and a client fetches them before every authorization. */
function cacheable(body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
    body: JSON.stringify(body),
  };
}

// --- Registration ----------------------------------------------------------

/** RFC 7591. Open registration: the client id it gets back is worth nothing on
 *  its own — it cannot reach an account until a user has typed a pairing code
 *  at the authorize step. */
export const register: APIGatewayProxyHandlerV2 = async (event) => {
  const request = parseJSON<{ client_name?: string; redirect_uris?: unknown }>(event);
  const uris = Array.isArray(request?.redirect_uris) ? request.redirect_uris.map(String) : [];
  if (uris.length === 0) return oauthError(400, "invalid_redirect_uri", "Send at least one redirect_uri.");
  for (const uri of uris) {
    if (!isSafeRedirect(uri)) {
      return oauthError(400, "invalid_redirect_uri", `${uri} is not a usable redirect URI.`);
    }
  }

  const client = await relay().registerClient({
    client_name: typeof request?.client_name === "string" ? request.client_name : undefined,
    redirect_uris: uris,
  });
  return json(201, {
    ...client,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: SUPPORTED.join(" "),
  });
};

/**
 * `https`, or a loopback address, or a private-use scheme like `cursor://`.
 *
 * Native MCP clients genuinely need the last two — that is what RFC 8252 is
 * for. What is refused is plain `http` to somewhere that is not this machine,
 * which would put an authorization code on the open wire.
 */
function isSafeRedirect(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false;
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
  // A private-use scheme has to actually be one, not "javascript:".
  return /^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol) && !["javascript:", "data:", "file:", "vbscript:"].includes(parsed.protocol);
}

// --- Authorization ---------------------------------------------------------

interface AuthorizationRequest {
  clientID: string;
  redirectURI: string;
  state?: string;
  codeChallenge: string;
  scopes: string[];
}

/**
 * Reads and checks an authorize request, whichever verb carried it.
 *
 * A fault in `client_id` or `redirect_uri` is answered as a page, never as a
 * redirect: those two are what proves where an answer may be sent, so an
 * unvalidated one is exactly what must not be dialled. Everything else is the
 * client's own protocol error and goes back to it as `?error=`.
 */
async function readAuthorization(
  params: Record<string, string>,
  store: Relay,
): Promise<AuthorizationRequest | { page: APIGatewayProxyStructuredResultV2 } | { redirect: string }> {
  const clientID = params.client_id ?? "";
  const redirectURI = params.redirect_uri ?? "";
  if (!clientID) return { page: problem("Which agent is this?", "The link that brought you here is missing its client_id, so there is nothing to connect.") };

  const client = await store.oauthClient(clientID);
  if (!client) return { page: problem("Unknown agent", "This client is not registered with Parla. Ask it to connect again from scratch.") };

  const target = redirectURI || client.redirect_uris[0]!;
  if (!client.redirect_uris.includes(target)) {
    return { page: problem("That is not where this agent lives", "The redirect address does not match the one this client registered, so the answer would go somewhere it is not supposed to.") };
  }

  const state = params.state;
  const fail = (error: string, description: string) => ({
    redirect: redirectTo(target, { error, error_description: description, state }),
  });

  if ((params.response_type ?? "code") !== "code") return fail("unsupported_response_type", "Only the authorization code flow is supported.");
  if (params.code_challenge_method && params.code_challenge_method !== "S256") return fail("invalid_request", "Only S256 PKCE challenges are supported.");
  if (!params.code_challenge) return fail("invalid_request", "PKCE is required: send a code_challenge.");

  const requested = (params.scope ?? READ).split(/\s+/).filter(Boolean);
  const unknown = requested.filter((scope) => !SUPPORTED.includes(scope));
  if (unknown.length > 0) return fail("invalid_scope", `No such scope: ${unknown.join(", ")}.`);

  return {
    clientID,
    redirectURI: target,
    state,
    codeChallenge: params.code_challenge,
    scopes: requested.length > 0 ? requested : [READ],
  };
}

/** GET /oauth/authorize — the consent screen. */
export const authorize: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const request = await readAuthorization(event.queryStringParameters as Record<string, string> ?? {}, store);
  if ("page" in request) return request.page;
  if ("redirect" in request) return seeOther(request.redirect);

  const client = await store.oauthClient(request.clientID);
  return consentPage(request, client?.client_name);
};

/**
 * POST /oauth/authorize — the user has typed the code.
 *
 * The pairing code is the whole of the identity check, so it is redeemed
 * before anything else happens, and redeeming it destroys it. A wrong code
 * re-renders the page rather than redirecting: the user is still here, still
 * has the app open, and can simply read it again.
 */
export const approve: APIGatewayProxyHandlerV2 = async (event) => {
  const store = relay();
  const form = parseForm(event);
  const request = await readAuthorization(form, store);
  if ("page" in request) return request.page;
  if ("redirect" in request) return seeOther(request.redirect);

  const client = await store.oauthClient(request.clientID);

  const typed = (form.code ?? "").trim();
  if (!typed) return consentPage(request, client?.client_name, "Type the code from the app to continue.");

  const pairing = await store.redeemPairing(typed);
  if (!pairing) {
    return consentPage(request, client?.client_name, "That code has expired or has already been used. Open Parla → Settings → Claude & agents and tap for a fresh one.");
  }

  // Three things have to agree before a scope is granted: the client asked for
  // it, the app's pairing allows it, and the user left the box ticked.
  const allowed = pairing.scopes.length > 0 ? pairing.scopes : [READ];
  const consented = request.scopes.filter((scope) => scope !== WRITE || form.write === "on");
  const granted = consented.filter((scope) => allowed.includes(scope));
  if (granted.length === 0) {
    return consentPage(request, client?.client_name, "Nothing was granted, so there is no connection to make.");
  }

  const code = await store.issueAuthorizationCode({
    account: pairing.account,
    scopes: granted,
    clientID: request.clientID,
    redirectURI: request.redirectURI,
    codeChallenge: request.codeChallenge,
  });
  return seeOther(redirectTo(request.redirectURI, { code, state: request.state }));
};

// --- The token endpoint ----------------------------------------------------

/**
 * POST /oauth/token — two grants.
 *
 * `authorization_code`: the code from the redirect, plus the PKCE verifier, for
 * a token pair. The verifier is what makes a public client safe: the code
 * travelled back through a browser and possibly past other software, but it is
 * worthless without a secret that never left the client.
 *
 * `refresh_token`: the long half of a pair for a fresh pair. The one presented
 * is spent in the process, so a client that refreshes twice with the same
 * token is refused the second time and starts over at consent.
 */
export const token: APIGatewayProxyHandlerV2 = async (event) => {
  // Form-encoded is what the spec says; JSON is what some clients send anyway,
  // and refusing them buys nothing but a support ticket.
  const form = parseTokenRequest(event);
  // A public client identifies itself in the body — but some send it as HTTP
  // Basic with an empty secret, which RFC 6749 allows, so look there too.
  const clientID = form.client_id || basicClientID(event);
  const store = relay();

  switch (form.grant_type ?? "") {
    case "authorization_code":
      return exchangeCode(form, clientID, store);
    case "refresh_token":
      return refresh(form, clientID, store);
    default:
      return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
  }
};

async function exchangeCode(form: Record<string, string>, clientID: string | undefined, store: Relay) {
  if (!form.code || !clientID || !form.code_verifier) {
    return oauthError(400, "invalid_request", "Send code, client_id and code_verifier.");
  }
  const grant = await store.redeemAuthorizationCode(form.code, {
    clientID,
    // Optional under OAuth 2.1 when PKCE is in play: the verifier is what binds
    // the code to the client, and the redirect was already checked against the
    // registration at authorize time. If a client does send it, it must match.
    redirectURI: form.redirect_uri || undefined,
    codeVerifier: form.code_verifier,
  });
  if ("error" in grant) return oauthError(400, grant.error, "That code is not usable. Start the connection again.");
  return issuePair(store, grant.account, grant.scopes, clientID);
}

async function refresh(form: Record<string, string>, clientID: string | undefined, store: Relay) {
  if (!form.refresh_token || !clientID) {
    return oauthError(400, "invalid_request", "Send refresh_token and client_id.");
  }
  const grant = await store.redeemRefreshToken(form.refresh_token, clientID);
  if (!grant) return oauthError(400, "invalid_grant", "That refresh token is not usable. Start the connection again.");

  // A client may ask for less on refresh, never more (RFC 6749 §6).
  let scopes = grant.scopes;
  if (form.scope) {
    const requested = form.scope.split(/\s+/).filter(Boolean);
    if (requested.some((scope) => !grant.scopes.includes(scope))) {
      return oauthError(400, "invalid_scope", "A refresh cannot widen what was granted.");
    }
    scopes = requested;
  }
  return issuePair(store, grant.account, scopes, clientID);
}

/** An access token and the refresh token that will replace it. */
async function issuePair(store: Relay, account: string, scopes: string[], clientID: string) {
  const clientName = (await store.oauthClient(clientID))?.client_name;
  const session = await store.openSession(account, { kind: "agent", scopes, clientName });
  const refreshToken = await store.issueRefreshToken(account, { scopes, clientID, clientName, accessToken: session.token });
  return json(200, {
    access_token: Relay.bearer(account, session.token),
    token_type: "Bearer",
    expires_in: session.expiresIn,
    refresh_token: refreshToken.token,
    scope: scopes.join(" "),
  });
}

// --- Plumbing --------------------------------------------------------------

function parseJSON<T>(event: APIGatewayProxyEventV2): T | null {
  if (!event.body) return null;
  try {
    const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** The token request, whichever way the client encoded it. */
function parseTokenRequest(event: APIGatewayProxyEventV2): Record<string, string> {
  const type = header(event, "content-type") ?? "";
  if (type.includes("json")) {
    const parsed = parseJSON<Record<string, unknown>>(event) ?? {};
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]));
  }
  return parseForm(event);
}

/** `client_id` from an `Authorization: Basic` header, if the client put it there. */
function basicClientID(event: APIGatewayProxyEventV2): string | undefined {
  const value = header(event, "authorization");
  const match = value?.match(/^Basic\s+(.+)$/i);
  if (!match) return undefined;
  try {
    const decoded = Buffer.from(match[1]!, "base64").toString("utf8");
    const id = decoded.split(":")[0];
    return id ? decodeURIComponent(id) : undefined;
  } catch {
    return undefined;
  }
}

/** The authorize and token endpoints take `application/x-www-form-urlencoded`,
 *  which is what OAuth specifies and what a browser form sends. */
function parseForm(event: APIGatewayProxyEventV2): Record<string, string> {
  if (!event.body) return {};
  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) out[key] = value;
  return out;
}

function redirectTo(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

function seeOther(location: string): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 303, headers: { location, "cache-control": "no-store" }, body: "" };
}

function oauthError(statusCode: number, error: string, description: string) {
  return bad(statusCode, description, { error, error_description: description });
}

// --- The pages -------------------------------------------------------------

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function page(statusCode: number, title: string, main: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Nothing on these pages loads from anywhere, and nothing may frame them:
      // a consent page inside someone else's frame is a clickjacking target.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
    body: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Parla</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7; --card: #fff; --ink: #111114; --muted: #5f5f68;
    --hairline: rgba(0,0,0,.09); --shadow: rgba(0,0,0,.08);
    --accent: #ff5c00; --accent-deep: #e65300; --cyan: #22d3ee;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0b0b0f; --card: #16161c; --ink: #f4f4f6; --muted: #9a9aa6;
            --hairline: rgba(255,255,255,.1); --shadow: rgba(0,0,0,.6); }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--ink);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  main {
    width: 100%; max-width: 30rem; background: var(--card); border-radius: 20px;
    padding: 2rem; box-shadow: 0 12px 40px var(--shadow); border: 1px solid var(--hairline);
  }
  .mark {
    width: 46px; height: 46px; border-radius: 13px; margin-bottom: 1.25rem;
    display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 1.4rem;
    background: linear-gradient(135deg, #ff8a3d, var(--accent) 55%, #c94400);
  }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem; letter-spacing: -0.01em; }
  p { color: var(--muted); margin: 0 0 1rem; }
  strong { color: var(--ink); }
  label { display: block; font-weight: 600; margin: 1.25rem 0 .4rem; }
  input[type=text] {
    width: 100%; padding: .8rem .9rem; font-size: 1.5rem; letter-spacing: .18em;
    text-align: center; text-transform: uppercase; font-family: ui-monospace, SFMono-Regular, monospace;
    border: 1px solid var(--hairline); border-radius: 12px; background: var(--bg); color: var(--ink);
  }
  input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .grant {
    display: flex; gap: .7rem; align-items: flex-start; margin: 1.25rem 0;
    padding: .9rem; border: 1px solid var(--hairline); border-radius: 12px;
  }
  .grant input { margin-top: .25rem; accent-color: var(--accent); }
  .grant span { display: block; font-size: .93rem; color: var(--muted); font-weight: 400; }
  .grant b { display: block; color: var(--ink); font-size: 1rem; }
  button {
    width: 100%; padding: .85rem 1rem; font-size: 1rem; font-weight: 700;
    color: #fff; background: var(--accent); border: 0; border-radius: 999px; cursor: pointer;
  }
  button:hover { background: var(--accent-deep); }
  .note { font-size: .85rem; margin: 1.25rem 0 0; }
  .warn {
    padding: .8rem .9rem; border-radius: 12px; margin: 0 0 1rem; font-size: .93rem; color: var(--ink);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
</head>
<body><main><div class="mark" aria-hidden="true">P</div>${main}</main></body>
</html>`,
  };
}

function problem(title: string, detail: string) {
  return page(400, title, `<h1>${escape(title)}</h1><p>${escape(detail)}</p>`);
}

function consentPage(request: AuthorizationRequest, clientName: string | undefined, warning?: string) {
  const who = clientName ? escape(clientName) : "An agent";
  const wantsWrite = request.scopes.includes(WRITE);
  const hidden = Object.entries({
    client_id: request.clientID,
    redirect_uri: request.redirectURI,
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    scope: request.scopes.join(" "),
    response_type: "code",
  })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escape(String(value))}">`)
    .join("");

  return page(200, "Connect an agent", `
<h1>Connect ${who} to Parla</h1>
<p>Open <strong>Parla → Settings → Claude &amp; agents</strong> on your iPhone and tap
<strong>Connect an agent</strong>. Type the code it shows below.</p>
${warning ? `<div class="warn">${escape(warning)}</div>` : ""}
<form method="post" action="/oauth/authorize">
  ${hidden}
  <label for="code">Pairing code</label>
  <input id="code" name="code" type="text" autocomplete="one-time-code" autocapitalize="characters"
         autocorrect="off" spellcheck="false" maxlength="8" required autofocus>
  <div class="grant">
    <span><b>Read your library</b>Your words and phrases, their tags, and how many you have learned.</span>
  </div>
  ${wantsWrite ? `
  <div class="grant">
    <input id="write" name="write" type="checkbox" checked>
    <label for="write" style="margin:0"><b>Let it add words and phrases</b>
      <span>New entries are queued and added by Parla on your iPhone the next time it is open, with the same duplicate check as adding them yourself. It can never change or delete what is already there.</span>
    </label>
  </div>` : ""}
  <button type="submit">Connect</button>
</form>
<p class="note">Your library stays on your devices and in iCloud. The relay keeps a copy
only while you are signed in, and signing out in Parla deletes that copy and
disconnects every agent.</p>`);
}
