import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

/** A JSON response. Never cached: every answer here is per request. */
export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
    body: JSON.stringify(body),
  };
}

export function bad(statusCode: number, message: string, extra: Record<string, unknown> = {}) {
  return json(statusCode, { error: message, ...extra });
}
