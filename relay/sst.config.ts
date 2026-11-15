/// <reference path="./.sst/platform/config.d.ts" />

/**
 * The Parla relay: Sign in with Apple for the app, and a remote MCP server
 * (OAuth 2.1 + PKCE) that lets Claude and other agents read the learner's
 * vocabulary and queue new words for the app to add.
 *
 * The library itself never moves here: it stays in the user's iCloud
 * container. The relay keeps a read-only copy (the projection) while the user
 * is signed in, and a queue of requests the app applies. See src/relay.ts.
 *
 * Deploy:
 *   npm install
 *   AWS_PROFILE=<profile> npx sst deploy --stage <stage>
 * The output `mcp` is the URL to add as a custom connector in Claude; `api`
 * goes into the app (app.json → expo.extra.relayUrl).
 */
export default $config({
  app(input) {
    return {
      name: "parla-relay",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        aws: { region: "eu-central-1" },
      },
    };
  },
  async run() {
    // One table: sessions, refresh tokens, pairing codes, OAuth clients and
    // codes, the projection (gzipped, split across rows) and the intent queue.
    // Tokens are stored only as SHA-256. TTL sweeps what expires.
    const relay = new sst.aws.Dynamo("Relay", {
      fields: { account: "string", sk: "string" },
      primaryIndex: { hashKey: "account", rangeKey: "sk" },
      ttl: "ttl",
      transform: {
        table: (args) => {
          args.pointInTimeRecovery = { enabled: $app.stage === "production" };
          args.serverSideEncryption = { enabled: true };
        },
      },
    });

    // Throttled at the stage. The shared CloudFront WAF (WAF202606) is not put
    // in front on purpose: its managed rule groups cap request bodies at 8 KB
    // and read free text as injections, and the projection push is a large
    // body full of free text (example sentences in a hundred languages).
    const api = new sst.aws.ApiGatewayV2("Api", {
      transform: {
        stage: (args) => {
          args.defaultRouteSettings = {
            throttlingBurstLimit: 50,
            throttlingRateLimit: 20,
          };
        },
      },
    });

    const fn = {
      link: [relay],
      environment: {
        RELAY_TABLE: relay.name,
        STAGE: $app.stage,
        // Comma-separated bundle ids whose Sign in with Apple tokens count.
        APPLE_AUDIENCES: process.env.APPLE_AUDIENCES ?? "tech.sp33c.parla.dev",
      },
      timeout: "20 seconds" as const,
      memory: "256 MB" as const,
    };

    api.route("GET /v1/health", { handler: "src/health.handler" });

    // --- The app's door ------------------------------------------------------
    api.route("POST /v1/account", { handler: "src/agent.signIn", ...fn });
    api.route("POST /v1/relay/pairing", { handler: "src/agent.pair", ...fn });
    api.route("PUT /v1/relay/projection", { handler: "src/agent.putProjection", ...fn, memory: "512 MB" });
    api.route("GET /v1/relay/intents", { handler: "src/agent.listIntents", ...fn });
    api.route("POST /v1/relay/intents/{id}/claim", { handler: "src/agent.claimIntent", ...fn });
    api.route("POST /v1/relay/intents/{id}/complete", { handler: "src/agent.completeIntent", ...fn });
    api.route("DELETE /v1/relay", { handler: "src/agent.forget", ...fn });

    // --- The agent's door: OAuth discovery, registration, consent, tokens ---
    for (const path of ["", "/mcp"]) {
      api.route(`GET /.well-known/oauth-authorization-server${path}`, {
        handler: "src/oauth.authorizationServerMetadata", ...fn,
      });
      api.route(`GET /.well-known/oauth-protected-resource${path}`, {
        handler: "src/oauth.protectedResourceMetadata", ...fn,
      });
    }
    api.route("POST /oauth/register", { handler: "src/oauth.register", ...fn });
    api.route("GET /oauth/authorize", { handler: "src/oauth.authorize", ...fn });
    api.route("POST /oauth/authorize", { handler: "src/oauth.approve", ...fn });
    api.route("POST /oauth/token", { handler: "src/oauth.token", ...fn });

    // --- MCP (Streamable HTTP, JSON mode) -----------------------------------
    api.route("POST /mcp", { handler: "src/mcp.handler", ...fn, memory: "512 MB" });
    api.route("GET /mcp", { handler: "src/mcp.notAllowed" });
    api.route("DELETE /mcp", { handler: "src/mcp.notAllowed" });

    return {
      api: api.url,
      mcp: $interpolate`${api.url}/mcp`,
    };
  },
});
