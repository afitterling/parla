import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * The Parla relay: a mailbox and a cache, never a replica.
 *
 * Parla keeps its library as JSON files in the user's iCloud container, and
 * the app is the only thing that writes them. This relay holds two things per
 * account and applies neither:
 *
 *  - the **projection**: the words and phrases as the app last pushed them, so
 *    an agent can read the library without waking a phone;
 *  - a queue of **intents**: words and phrases an agent asked to have added.
 *    The app claims each one, adds it through the same code path a tap uses
 *    (duplicate check included), and reports back.
 *
 * Mirroring the library into DynamoDB as a second source of truth was the
 * obvious alternative and is rejected on purpose: iCloud already merges the
 * phone and the Mac, and a second engine resolving conflicts on another clock
 * would leave nobody able to say which copy is right.
 *
 * Ported from the Shopping List relay (`shopping-list/backend/src/relay.ts`).
 * Differences: Parla's scopes and operations, no delete scope (agents can only
 * add), the agent's name rides along on every intent so the app can tag what
 * it brought, and the projection is gzipped and split across rows because a
 * vocabulary outgrows DynamoDB's 400 KB item limit long before a shopping
 * list does.
 */

export const READ = "vocab:read";
export const WRITE = "vocab:write";
export const SUPPORTED_SCOPES = [READ, WRITE];

/** Applied intents are swept after a week; nothing else expires. */
const APPLIED_TTL_SECONDS = 7 * 24 * 60 * 60;
/** An intent nobody claimed in a week is failed rather than left waiting. A
 *  phone that is not opened for days is normal for a language app. */
const CLAIM_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * How long a claimed intent may stay `applying` before it is given up on.
 * Failed rather than re-offered: the claim is what makes an intent apply at
 * most once, and nothing here can tell "died before applying" from "applied,
 * then died before saying so".
 */
const REPORT_DEADLINE_MS = 5 * 60 * 1000;
/** A session the app holds, and an agent's access token. Long, because hosts
 *  such as claude.ai treat a failed refresh as "sign in again". */
const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
/** Read off one screen and typed into another. */
const PAIRING_TTL_SECONDS = 10 * 60;
/** Exchanged immediately by a machine. */
const AUTH_CODE_TTL_SECONDS = 5 * 60;
/** A runaway agent cannot bury the phone in requests. */
export const MAX_PENDING = 200;
/** Each projection row stays well under DynamoDB's 400 KB item limit. */
const PROJECTION_PART_BYTES = 300 * 1024;

const GLOBAL = {
  pairing: (code: string) => `pairing#${code}`,
  client: (id: string) => `client#${id}`,
  authCode: (code: string) => `authcode#${code}`,
};

/** Unambiguous by sight and by ear: no O/0, no I/1/l. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
}

/** What an agent can ask for. Both only ever add; nothing an agent does can
 *  remove or overwrite a word. */
export const INTENT_OPERATIONS = ["add-vocab", "add-phrases"] as const;
export type IntentOperation = (typeof INTENT_OPERATIONS)[number];

export type IntentState = "pending" | "applying" | "applied" | "failed";

export interface Intent {
  id: string;
  operation: IntentOperation;
  /** Validated by `mcp.ts` before it is queued, and again by the app. */
  arguments: Record<string, unknown>;
  /** The connected agent's name, for the app to tag what it adds. */
  source?: string;
  state: IntentState;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

export interface Projection {
  /** What the app pushed, opaque to the store. */
  payload: unknown;
  asOf: string;
}

export interface Session {
  account: string;
  scopes: string[];
  /** `app` for a device, `agent` for an OAuth client. */
  kind: "app" | "agent";
  /** The agent's registered name, when it gave one. */
  clientName?: string;
}

export interface DocumentClient {
  send(command: any): Promise<any>;
}

function isConditionFailure(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "ConditionalCheckFailedException" || name === "TransactionCanceledException";
}

/** Between the account and the secret in a bearer token. Apple's `sub` is
 *  dotted, so `.` would not split unambiguously; `~` is in neither it nor
 *  base64url. */
const SEPARATOR = "~";

/** Tokens are stored only as their SHA-256. */
function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Sortable ids, so a query returns intents in the order they were asked for. */
export function intentID(now: number, random: () => string = () => randomUUID()): string {
  return `${now.toString(36).padStart(9, "0")}-${random().replace(/-/g, "").slice(0, 12)}`;
}

export class Relay {
  private readonly client: DocumentClient;
  private readonly table: string;
  private readonly now: () => number;
  private readonly random: () => string;

  constructor(options: {
    client: DocumentClient;
    table: string;
    now?: () => number;
    random?: () => string;
  }) {
    this.client = options.client;
    this.table = options.table;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomUUID());
  }

  private stamp(at: number = this.now()): string {
    return new Date(at).toISOString();
  }

  /** The clock this relay stamps by. Ages of rows it wrote are measured
   *  against the same clock. */
  get clock(): number {
    return this.now();
  }

  // MARK: - Sessions

  async openSession(
    account: string,
    options: { kind: Session["kind"]; scopes: string[]; clientName?: string },
  ): Promise<{ token: string; expiresAt: string; expiresIn: number }> {
    const token = randomBytes(32).toString("base64url");
    const lifetime = SESSION_TTL_SECONDS;
    const expiresAt = this.now() + lifetime * 1000;
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: {
        account,
        sk: `session#${fingerprint(token)}`,
        kind: options.kind,
        scopes: options.scopes,
        ...(options.clientName ? { clientName: options.clientName } : {}),
        createdAt: this.stamp(),
        ttl: Math.floor(expiresAt / 1000),
      },
    }));
    return { token, expiresAt: this.stamp(expiresAt), expiresIn: lifetime };
  }

  /** The long half of an agent's credential: single use, rotated, bound to the
   *  client and to the access token it was issued beside. */
  async issueRefreshToken(
    account: string,
    grant: { scopes: string[]; clientID: string; clientName?: string; accessToken: string },
  ): Promise<{ token: string; expiresIn: number }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SESSION_TTL_SECONDS * 1000;
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: {
        account,
        sk: `refresh#${fingerprint(token)}`,
        scopes: grant.scopes,
        clientID: grant.clientID,
        ...(grant.clientName ? { clientName: grant.clientName } : {}),
        session: `session#${fingerprint(grant.accessToken)}`,
        createdAt: this.stamp(),
        ttl: Math.floor(expiresAt / 1000),
      },
    }));
    return { token: Relay.bearer(account, token), expiresIn: SESSION_TTL_SECONDS };
  }

  /** Spends a refresh token: once, and only by the client it was issued to.
   *  The old refresh token and its access token are gone before anything is
   *  returned. */
  async redeemRefreshToken(
    presented: string,
    clientID: string,
  ): Promise<{ account: string; scopes: string[]; clientName?: string } | null> {
    const split = splitBearer(presented);
    if (!split) return null;
    const { account, secret } = split;

    const key = { account, sk: `refresh#${fingerprint(secret)}` };
    const out = await this.client.send(new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }));
    const row = out.Item as {
      scopes?: string[]; clientID?: string; clientName?: string; session?: string; ttl?: number;
    } | undefined;
    if (!row) return null;
    await this.client.send(new DeleteCommand({ TableName: this.table, Key: key }));
    if (row.session) {
      await this.client.send(new DeleteCommand({ TableName: this.table, Key: { account, sk: row.session } }));
    }
    if (row.ttl !== undefined && row.ttl * 1000 <= this.now()) return null;
    if (row.clientID !== clientID) return null;
    return { account, scopes: row.scopes ?? [], clientName: row.clientName };
  }

  /** Who a bearer token (`<account>~<secret>`) is, or null. */
  async session(bearer: string | undefined): Promise<Session | null> {
    const split = bearer ? splitBearer(bearer) : null;
    if (!split) return null;
    const { account, secret } = split;

    const out = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: { account, sk: `session#${fingerprint(secret)}` },
      ConsistentRead: true,
    }));
    const row = out.Item as { kind?: Session["kind"]; scopes?: string[]; clientName?: string; ttl?: number } | undefined;
    if (!row) return null;
    // DynamoDB deletes expired rows lazily, so the deadline is checked here.
    if (row.ttl !== undefined && row.ttl * 1000 <= this.now()) return null;
    return { account, kind: row.kind ?? "agent", scopes: row.scopes ?? [], clientName: row.clientName };
  }

  static bearer(account: string, token: string): string {
    return `${account}${SEPARATOR}${token}`;
  }

  // MARK: - The projection

  /**
   * Replaces the projection wholesale.
   *
   * Gzipped, then split into rows under a fresh generation. The header row is
   * written last and names the generation, so a reader never stitches parts of
   * two different pushes together; the previous generation's parts are deleted
   * after the header has moved on.
   */
  async putProjection(account: string, payload: unknown): Promise<Projection> {
    const asOf = this.stamp();
    const zipped = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    const generation = intentID(this.now(), this.random);
    const parts = Math.max(1, Math.ceil(zipped.length / PROJECTION_PART_BYTES));

    const previous = await this.projectionHeader(account);
    for (let index = 0; index < parts; index++) {
      const slice = zipped.subarray(index * PROJECTION_PART_BYTES, (index + 1) * PROJECTION_PART_BYTES);
      await this.client.send(new PutCommand({
        TableName: this.table,
        Item: { account, sk: partKey(generation, index), data: new Uint8Array(slice) },
      }));
    }
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: { account, sk: "projection", generation, parts, updatedAt: asOf },
    }));
    if (previous) {
      for (let index = 0; index < previous.parts; index++) {
        await this.client.send(new DeleteCommand({
          TableName: this.table, Key: { account, sk: partKey(previous.generation, index) },
        }));
      }
    }
    return { payload, asOf };
  }

  private async projectionHeader(account: string): Promise<{ generation: string; parts: number; updatedAt: string } | null> {
    const out = await this.client.send(new GetCommand({
      TableName: this.table, Key: { account, sk: "projection" }, ConsistentRead: true,
    }));
    const row = out.Item as { generation?: string; parts?: number; updatedAt?: string } | undefined;
    if (!row?.generation || !row.parts) return null;
    return { generation: row.generation, parts: row.parts, updatedAt: row.updatedAt ?? this.stamp() };
  }

  async projection(account: string): Promise<Projection | null> {
    const header = await this.projectionHeader(account);
    if (!header) return null;
    const chunks: Buffer[] = [];
    for (let index = 0; index < header.parts; index++) {
      const out = await this.client.send(new GetCommand({
        TableName: this.table, Key: { account, sk: partKey(header.generation, index) }, ConsistentRead: true,
      }));
      const data = (out.Item as { data?: Uint8Array } | undefined)?.data;
      // A part went missing between the header read and now: a newer push is
      // landing. Better to say there is nothing than to stitch half of it.
      if (!data) return null;
      chunks.push(Buffer.from(data));
    }
    try {
      const payload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8"));
      return { payload, asOf: header.updatedAt };
    } catch {
      return null;
    }
  }

  // MARK: - Intents

  async enqueue(
    account: string,
    operation: IntentOperation,
    args: Record<string, unknown>,
    source?: string,
  ): Promise<Intent | null> {
    if ((await this.pending(account, MAX_PENDING)).length >= MAX_PENDING) return null;
    const at = this.stamp();
    const intent: Intent = {
      id: intentID(this.now(), this.random),
      operation,
      arguments: args,
      ...(source ? { source } : {}),
      state: "pending",
      createdAt: at,
      updatedAt: at,
    };
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: { account, sk: `intent#${intent.id}`, ...intent },
    }));
    return intent;
  }

  async intent(account: string, id: string): Promise<Intent | null> {
    const out = await this.client.send(new GetCommand({
      TableName: this.table, Key: { account, sk: `intent#${id}` }, ConsistentRead: true,
    }));
    return stripKeys(out.Item as (Intent & { account?: string; sk?: string; ttl?: number }) | undefined);
  }

  /** Everything still waiting, oldest first. Stale rows are failed on the way
   *  past rather than handed out. */
  async pending(account: string, limit = 50): Promise<Intent[]> {
    const live: Intent[] = [];
    const unclaimedDeadline = this.now() - CLAIM_DEADLINE_MS;
    const reportDeadline = this.now() - REPORT_DEADLINE_MS;
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const out = await this.client.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "account = :a AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":a": account, ":prefix": "intent#" },
        ConsistentRead: true,
        ExclusiveStartKey,
      }));
      for (const row of (out.Items as Intent[] | undefined) ?? []) {
        if (row.state === "applying" && Date.parse(row.updatedAt) < reportDeadline) {
          await this.complete(account, row.id, {
            state: "failed",
            error: "Parla picked this up but never confirmed it. Check the library before asking again.",
          });
          continue;
        }
        if (row.state !== "pending") continue;
        if (Date.parse(row.createdAt) < unclaimedDeadline) {
          await this.complete(account, row.id, {
            state: "failed",
            error: "Parla was not opened in time to pick this up.",
          });
          continue;
        }
        live.push(stripKeys(row)!);
        if (live.length >= limit) return live;
      }
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return live;
  }

  /** Claims an intent for this device, exactly once. */
  async claim(account: string, id: string): Promise<Intent | null> {
    try {
      const out = await this.client.send(new UpdateCommand({
        TableName: this.table,
        Key: { account, sk: `intent#${id}` },
        ConditionExpression: "#state = :pending",
        UpdateExpression: "SET #state = :applying, updatedAt = :at",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":pending": "pending", ":applying": "applying", ":at": this.stamp() },
        ReturnValues: "ALL_NEW",
      }));
      return stripKeys(out.Attributes as Intent);
    } catch (error) {
      if (isConditionFailure(error)) return null;
      throw error;
    }
  }

  /** Records what the device made of it. Terminal either way. */
  async complete(
    account: string,
    id: string,
    outcome: { state: "applied"; result: unknown } | { state: "failed"; error: string },
  ): Promise<boolean> {
    const ttl = Math.floor(this.now() / 1000) + APPLIED_TTL_SECONDS;
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.table,
        Key: { account, sk: `intent#${id}` },
        // Only an intent that exists and is not already settled can be
        // settled: a report on an unknown id must not conjure a row.
        ConditionExpression: "attribute_exists(sk) AND (#state = :pending OR #state = :applying)",
        UpdateExpression: outcome.state === "applied"
          ? "SET #state = :s, #result = :value, updatedAt = :at, #ttl = :ttl"
          : "SET #state = :s, #error = :value, updatedAt = :at, #ttl = :ttl",
        ExpressionAttributeNames: outcome.state === "applied"
          ? { "#state": "state", "#result": "result", "#ttl": "ttl" }
          : { "#state": "state", "#error": "error", "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":s": outcome.state,
          ":value": outcome.state === "applied" ? outcome.result : outcome.error,
          ":at": this.stamp(),
          ":ttl": ttl,
          ":pending": "pending",
          ":applying": "applying",
        },
      }));
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }

  // MARK: - Pairing an agent

  /**
   * A short code the user reads out of Parla's Settings and types into the
   * consent page. The app already proved who it is to Apple; doing Sign in
   * with Apple again on the web would need a Service ID, a client-secret JWT
   * and a second redirect, all to re-establish an identity the app holds.
   */
  async createPairing(account: string, scopes: string[]): Promise<{ code: string; expiresAt: string }> {
    const code = this.code(8);
    const expiresAt = this.now() + PAIRING_TTL_SECONDS * 1000;
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: {
        account: GLOBAL.pairing(code),
        sk: "pairing",
        owner: account,
        scopes,
        createdAt: this.stamp(),
        ttl: Math.floor(expiresAt / 1000),
      },
    }));
    return { code, expiresAt: this.stamp(expiresAt) };
  }

  /** Single use: redeeming deletes it. */
  async redeemPairing(code: string): Promise<{ account: string; scopes: string[] } | null> {
    const key = { account: GLOBAL.pairing(code.trim().toUpperCase()), sk: "pairing" };
    const out = await this.client.send(new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }));
    const row = out.Item as { owner?: string; scopes?: string[]; ttl?: number } | undefined;
    if (!row?.owner) return null;
    await this.client.send(new DeleteCommand({ TableName: this.table, Key: key }));
    if (row.ttl !== undefined && row.ttl * 1000 <= this.now()) return null;
    return { account: row.owner, scopes: row.scopes ?? [] };
  }

  // MARK: - OAuth

  /** RFC 7591 dynamic client registration. */
  async registerClient(metadata: { client_name?: string; redirect_uris: string[] }): Promise<OAuthClient> {
    const client: OAuthClient = {
      client_id: this.code(24),
      ...(metadata.client_name ? { client_name: metadata.client_name } : {}),
      redirect_uris: metadata.redirect_uris,
      token_endpoint_auth_method: "none",
    };
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: { account: GLOBAL.client(client.client_id), sk: "client", ...client, createdAt: this.stamp() },
    }));
    return client;
  }

  async oauthClient(clientID: string): Promise<OAuthClient | null> {
    const out = await this.client.send(new GetCommand({
      TableName: this.table, Key: { account: GLOBAL.client(clientID), sk: "client" }, ConsistentRead: true,
    }));
    const row = out.Item as (OAuthClient & { account?: string; sk?: string; createdAt?: string }) | undefined;
    if (!row) return null;
    return {
      client_id: row.client_id,
      ...(row.client_name ? { client_name: row.client_name } : {}),
      redirect_uris: row.redirect_uris,
      token_endpoint_auth_method: "none",
    };
  }

  async issueAuthorizationCode(grant: {
    account: string;
    scopes: string[];
    clientID: string;
    redirectURI: string;
    codeChallenge: string;
  }): Promise<string> {
    const code = this.code(32);
    await this.client.send(new PutCommand({
      TableName: this.table,
      Item: {
        account: GLOBAL.authCode(code),
        sk: "code",
        owner: grant.account,
        scopes: grant.scopes,
        clientID: grant.clientID,
        redirectURI: grant.redirectURI,
        codeChallenge: grant.codeChallenge,
        ttl: Math.floor((this.now() + AUTH_CODE_TTL_SECONDS * 1000) / 1000),
      },
    }));
    return code;
  }

  /** Exchanges an authorization code once. The code is deleted before the PKCE
   *  verifier is checked, so a wrong guess costs the attacker the code too. */
  async redeemAuthorizationCode(
    code: string,
    presented: { clientID: string; redirectURI?: string; codeVerifier: string },
  ): Promise<{ account: string; scopes: string[] } | { error: string }> {
    const key = { account: GLOBAL.authCode(code), sk: "code" };
    const out = await this.client.send(new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }));
    const row = out.Item as {
      owner?: string; scopes?: string[]; clientID?: string;
      redirectURI?: string; codeChallenge?: string; ttl?: number;
    } | undefined;
    if (!row?.owner) return { error: "invalid_grant" };
    await this.client.send(new DeleteCommand({ TableName: this.table, Key: key }));

    if (row.ttl !== undefined && row.ttl * 1000 <= this.now()) return { error: "invalid_grant" };
    if (row.clientID !== presented.clientID) return { error: "invalid_grant" };
    if (presented.redirectURI !== undefined && row.redirectURI !== presented.redirectURI) {
      return { error: "invalid_grant" };
    }
    const digest = createHash("sha256").update(presented.codeVerifier).digest("base64url");
    if (digest !== row.codeChallenge) return { error: "invalid_grant" };

    return { account: row.owner, scopes: row.scopes ?? [] };
  }

  /** Random, from an alphabet chosen so a human can read it back. Rejection
   *  sampling keeps every character equally likely. */
  private code(length: number): string {
    let out = "";
    const limit = 256 - (256 % CODE_ALPHABET.length);
    while (out.length < length) {
      for (const byte of randomBytes(length * 2)) {
        if (byte >= limit) continue;
        out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        if (out.length === length) break;
      }
    }
    return out;
  }

  // MARK: - Forgetting

  /** Everything the relay knows about an account, gone: projection, queue,
   *  the app's session and every connected agent. */
  async forget(account: string): Promise<number> {
    let deleted = 0;
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const out = await this.client.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "account = :a",
        ExpressionAttributeValues: { ":a": account },
        ProjectionExpression: "account, sk",
        ExclusiveStartKey,
      }));
      for (const row of (out.Items as { account: string; sk: string }[] | undefined) ?? []) {
        await this.client.send(new DeleteCommand({ TableName: this.table, Key: { account: row.account, sk: row.sk } }));
        deleted++;
      }
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return deleted;
  }
}

function partKey(generation: string, index: number): string {
  return `projection#${generation}#${String(index).padStart(3, "0")}`;
}

function splitBearer(bearer: string): { account: string; secret: string } | null {
  const separator = bearer.indexOf(SEPARATOR);
  if (separator <= 0) return null;
  const secret = bearer.slice(separator + 1);
  if (!secret) return null;
  return { account: bearer.slice(0, separator), secret };
}

/** An intent as the wire sees it, without the table's own columns. */
function stripKeys(row: (Intent & { account?: string; sk?: string; ttl?: number }) | undefined): Intent | null {
  if (!row) return null;
  const { account: _account, sk: _sk, ttl: _ttl, ...intent } = row;
  return intent;
}

let shared: Relay | undefined;

/** The real relay, built on first use so importing never needs a deployed
 *  stage. The table name arrives as `RELAY_TABLE` (see sst.config.ts). */
export function relay(): Relay {
  if (shared) return shared;
  const table = process.env.RELAY_TABLE;
  if (!table) throw new Error("RELAY_TABLE is not set; the relay is not deployed here.");
  shared = new Relay({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    }),
    table,
  });
  return shared;
}

/** Tests hand the handlers a relay over a fake table. */
export function useRelay(instance: Relay | undefined): void {
  shared = instance;
}
