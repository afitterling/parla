import { createHash } from "node:crypto";
import { Relay, useRelay } from "../src/relay.ts";
import { FakeDynamo } from "./fake-dynamo.ts";

/**
 * Enough of an API Gateway v2 event to call a handler, and a relay over a fake
 * table for it to read.
 *
 * The handlers are the part of this backend a browser and an MCP client
 * actually meet, so they are worth testing as themselves rather than through
 * the `Relay` class underneath them.
 */

export function relayOverFake(now = () => 1_700_000_000_000) {
  const table = new FakeDynamo({ hash: "account", range: "sk" });
  let counter = 0;
  const store = new Relay({
    client: table,
    table: "Relay",
    now,
    random: () => `fixed${String(counter++).padStart(7, "0")}`,
  });
  useRelay(store);
  return { table, store };
}

export interface EventOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  path?: Record<string, string>;
  body?: unknown;
  /** Sends the body as a form post rather than as JSON. */
  form?: Record<string, string>;
}

export function event(options: EventOptions = {}): any {
  const body = options.form
    ? new URLSearchParams(options.form).toString()
    : options.body === undefined
      ? undefined
      : JSON.stringify(options.body);
  return {
    version: "2.0",
    headers: {
      host: "parla.example",
      ...(options.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...options.headers,
    },
    queryStringParameters: options.query,
    pathParameters: options.path,
    requestContext: { domainName: "parla.example" },
    isBase64Encoded: false,
    body,
  };
}

/** Handlers are typed for AWS's three arguments; tests only ever need one. */
export async function call(handler: any, options: EventOptions = {}): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: any;
}> {
  const response = await handler(event(options), {} as any, (() => {}) as any);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response?.headers ?? {})) {
    headers[name.toLowerCase()] = String(value);
  }
  let parsed: unknown;
  try {
    parsed = response?.body ? JSON.parse(response.body) : undefined;
  } catch {
    parsed = undefined;
  }
  return { statusCode: response?.statusCode ?? 200, headers, body: response?.body ?? "", json: parsed };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** The PKCE pair, as a client would make it. */
export function pkce(verifier: string) {
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
