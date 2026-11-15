import { createPublicKey, createVerify } from "node:crypto";

/**
 * Verifying a Sign in with Apple identity token.
 *
 * The account id is Apple's `sub`, and the server must learn it from Apple's
 * signature rather than from the client's say-so. A client that could name its
 * own account id could name someone else's.
 *
 * Ported from the Shopping List relay (`shopping-list/backend/src/apple.ts`),
 * which has been through review; only the audience differs.
 *
 * Written against `node:crypto` rather than a JWT library because the whole of
 * what is needed is "RS256 over two base64url segments, with a key fetched by
 * `kid`", and a dependency that does that also does thirty things this service
 * must never be talked into doing (`none`, HS256 with the public key as the
 * secret, unverified decode).
 */

/**
 * The bundle ids whose identity tokens are accepted. Apple puts the bundle id in
 * `aud`. Parla currently ships as `tech.sp33c.parla.dev`; `APPLE_AUDIENCES`
 * (comma-separated) lets a stage accept another id without a code change.
 */
export const BUNDLE_IDS = (process.env.APPLE_AUDIENCES ?? "tech.sp33c.parla.dev")
  .split(",").map((id) => id.trim()).filter(Boolean);
const ISSUER = "https://appleid.apple.com";
const KEYS_URL = "https://appleid.apple.com/auth/keys";

/** What Apple vouches for. Only `sub` is ever stored. */
export interface AppleIdentity {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

interface JWK {
  kty: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}

export class AppleAuthError extends Error {}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Apple's public keys, cached for an hour.
 *
 * They rotate, so this cannot be pinned the way the App Store root CA is; an
 * hour is short enough that a retired key stops being accepted promptly and
 * long enough that a busy Lambda is not fetching them per request. A `kid`
 * that is not in the cache refetches once before it is refused, so a rotation
 * costs one extra request rather than an outage.
 */
export class AppleKeys {
  private keys = new Map<string, JWK>();
  private fetchedAt = 0;
  private readonly ttlMs: number;
  private readonly load: () => Promise<{ keys: JWK[] }>;
  private readonly now: () => number;

  constructor(options: {
    load?: () => Promise<{ keys: JWK[] }>;
    now?: () => number;
    ttlMs?: number;
  } = {}) {
    this.load = options.load ?? (async () => {
      const response = await fetch(KEYS_URL);
      if (!response.ok) throw new AppleAuthError(`Apple's keys answered ${response.status}.`);
      return (await response.json()) as { keys: JWK[] };
    });
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  }

  async get(kid: string): Promise<JWK> {
    const fresh = this.now() - this.fetchedAt < this.ttlMs;
    if (fresh && this.keys.has(kid)) return this.keys.get(kid)!;
    await this.refresh();
    const key = this.keys.get(kid);
    if (!key) throw new AppleAuthError("The token names a signing key Apple does not publish.");
    return key;
  }

  private async refresh(): Promise<void> {
    const { keys } = await this.load();
    this.keys = new Map(keys.map((key) => [key.kid, key]));
    this.fetchedAt = this.now();
  }
}

/**
 * Verifies the signature, the issuer, the audience and the clock, and returns
 * what Apple said. Throws `AppleAuthError` on anything short of that — there is
 * no partial success worth reporting, and the caller answers 401 either way.
 */
export async function verifyIdentityToken(
  token: string,
  options: { keys: AppleKeys; audiences?: string[]; now?: () => number },
): Promise<AppleIdentity> {
  const now = options.now ?? Date.now;
  const audiences = options.audiences ?? BUNDLE_IDS;

  const parts = token.split(".");
  if (parts.length !== 3) throw new AppleAuthError("Not a JWT.");
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let claims: Partial<AppleIdentity>;
  try {
    header = decodeSegment(headerSegment) as { alg?: string; kid?: string };
    claims = decodeSegment(payloadSegment) as Partial<AppleIdentity>;
  } catch {
    throw new AppleAuthError("The token is not readable.");
  }

  // Checked before anything else is believed: `alg` is attacker-controlled, and
  // the only safe response to an unexpected one is to stop.
  if (header.alg !== "RS256") throw new AppleAuthError("Unexpected signing algorithm.");
  if (!header.kid) throw new AppleAuthError("The token names no signing key.");

  const jwk = await options.keys.get(header.kid);
  if (jwk.kty !== "RSA") throw new AppleAuthError("Unexpected key type.");
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  if (!verifier.verify(key, Buffer.from(signatureSegment, "base64url"))) {
    throw new AppleAuthError("The signature does not verify.");
  }

  if (claims.iss !== ISSUER) throw new AppleAuthError("Not issued by Apple.");
  if (typeof claims.aud !== "string" || !audiences.includes(claims.aud)) throw new AppleAuthError("Issued for a different app.");
  if (typeof claims.sub !== "string" || !claims.sub) throw new AppleAuthError("The token names no subject.");
  const seconds = Math.floor(now() / 1000);
  // A minute of slack, in the one direction where a strict answer would reject
  // a token that is fine: clocks disagree, and Apple's is the authority.
  if (typeof claims.exp !== "number" || claims.exp + 60 < seconds) {
    throw new AppleAuthError("The token has expired.");
  }
  if (typeof claims.iat !== "number" || claims.iat - 60 > seconds) {
    throw new AppleAuthError("The token is from the future.");
  }

  return { sub: claims.sub, aud: claims.aud!, iss: claims.iss!, exp: claims.exp, iat: claims.iat };
}
