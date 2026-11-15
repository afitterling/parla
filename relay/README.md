# Parla relay: Sign in with Apple + the Claude connector

This relay connects Parla to Claude and other agents. An agent can:

- read the learner's vocabulary and phrases, and
- add new words, for example from a lesson the agent is teaching.

The library itself never moves. It stays as JSON in the user's iCloud container, and the app is the only thing that writes it.

```
Claude ──MCP/OAuth──▶ relay (API Gateway + Lambda + DynamoDB) ◀──HTTPS── Parla (iPhone)
                       │ projection: last pushed copy of the library │
                       │ queue: words agents asked for               │
```

- **Sign in.** The app runs Sign in with Apple and sends the identity token to `POST /v1/account`. The relay checks the RS256 signature against Apple's published keys. The issuer must be Apple and the audience must be Parla's bundle id (`APPLE_AUDIENCES`). The account id is Apple's `sub`. The app asks Apple for neither name nor email.
- **Reads.** The app pushes a *projection* (its vocab, phrases and languages) a few seconds after any change. Agents read this copy, and every answer says how old it is.
- **Writes.** `add-vocab` and `add-phrases` only *queue* a request.
  - The app picks requests up on launch, when it returns to the foreground, and once a minute while open.
  - It claims each request exactly once and adds the words through the same duplicate check as typing them in, then reports the result back.
  - Agents can only add. Nothing can change or delete an existing word.
- **Connecting Claude.** Claude uses OAuth 2.1 with PKCE `S256` only and registers itself through open dynamic registration (RFC 7591).
  - The consent page asks for an 8-character pairing code. The app makes it under Settings → Claude & agents; it lasts 10 minutes and works once.
  - The page has two scopes: `vocab:read` (always granted) and `vocab:write` (a checkbox, ticked by default).
- **Signing out** (`DELETE /v1/relay`) deletes the projection, the queue, the app's session and every agent's tokens.

Tokens are stored only as SHA-256 hashes. The projection is gzipped and split across rows, because a large vocabulary is bigger than DynamoDB's 400 KB item limit. Ported from `shopping-list/backend`, which uses the same design and has already been reviewed.

## MCP tools

| Tool | Scope | What it does |
|---|---|---|
| `overview` | read | Input and goal language; per language: word, learned and phrase counts, plus the top tags |
| `search-vocab` | read | Filter words by `lang`, `tag`, `query` (ignores accents and case, also searches the reading) and `learned`; paged |
| `search-phrases` | read | Same filters, for phrases |
| `request-status` | read | Whether a queued request has been added yet |
| `add-vocab` | write | Up to 100 words: `term`, `translation`, optional `reading`, `example*`, `lang`, `tags` |
| `add-phrases` | write | Up to 100 phrases: `text`, `translation`, optional `reading`, `lang`, `tags` |

If `lang` is left out, it defaults to the language currently being learned. Words already in the library are skipped and named in the answer. If the agent gives no tags, the app tags new words with the agent's name, so you can filter them in the Vocab tab.

## Develop

```sh
npm install
npm run typecheck
npm test          # node --test, against an in-memory DynamoDB fake
```

## Deploy

```sh
AWS_PROFILE=<profile> npx sst deploy --stage <stage>
```

1. Put the `api` output into `app/app.json` → `expo.extra.relayUrl`, then rebuild the app.
2. Make sure the App ID `tech.sp33c.parla.dev` has the **Sign in with Apple** capability. If it doesn't, signing in fails at Apple with error 1000.
3. In Claude, open Settings → Connectors → *Add custom connector* and paste the `mcp` output (`…/mcp`). Choose *Connect*, then type the code from Parla.

If the bundle id changes, set `APPLE_AUDIENCES` (comma-separated) when you deploy.

API Gateway is throttled at the stage (burst 50, rate 20/s). The shared CloudFront WAF is deliberately left out: its managed rules cap request bodies at 8 KB and treat example sentences as injection attempts.
