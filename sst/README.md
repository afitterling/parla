# Parla web (Remix + SST on AWS)

Scaffold of the Parla web client: the marketing landing page and the app UI in
one Remix app, deployed with SST v3.

- `/` — landing page (waitlist). Carried over from the previous `obsolete/sst`
  build, unchanged and working.
- `/app`, `/app/vocab`, `/app/phrases`, `/app/settings` — the web UI. **Stubs.**
  Each renders a `<Scaffold>` placeholder listing what it still needs.

## Status — this is a scaffold, not a working app

Nothing here has been deployed to AWS, and no route has been run against the
real OpenAI API. What exists:

| Piece | State |
| --- | --- |
| `sst.config.ts` — Remix + secret + Dynamo table | declared, **never deployed** |
| `app/core/languages.ts`, `app/core/i18n/` | copied verbatim from the desktop client |
| `app/core/types.ts` | real — shapes match iOS + desktop |
| `app/core/openai.server.ts` — `chat()`, `breakdown()` | written (prompts ported verbatim), **not yet run** |
| `app/core/openai.server.ts` — `transcribe()` | **not implemented** (open question 3) |
| `app/routes/api.chat.ts`, `api.breakdown.ts` | wired to the above; **no auth, no rate limit** |
| `app/routes/api.transcribe.ts` | returns 501 |
| `app/core/storage.client.ts` | works (localStorage, per-browser only) |
| `app/core/storage.server.ts` | **not implemented** (open question 1) |
| `app/routes/app.*.tsx` | placeholder screens |
| `app/styles/parla.css` | full design tokens + component classes from desktop |

## Why the web client is not just a copy of the desktop one

The desktop app is Chromium, so `desktop/src/renderer/src/screens/*` port over
almost directly — same React, same CSS, and `SpeakButton` already uses the Web
Speech API. Two things genuinely differ:

**1. The OpenAI key cannot ship to the browser.** iOS and desktop bake the key
into the build (`EXPO_PUBLIC_OPENAI_API_KEY` / `VITE_OPENAI_API_KEY`). On the
web any visitor could read it out of the bundle and spend against it. So the
browser calls our own routes (`/api/chat`, `/api/breakdown`) and the key stays
in an SST secret, server-side. This is the same risk `TODO.md` already flags for
mobile ("the rate limit is only client-enforced and the key is extractable") —
the web forces the fix, and the proxy here is a candidate for the mobile
backend too.

**2. There is no iCloud on the web.** Both existing clients sync through the
user's own iCloud container. The web has no equivalent, which is what the
DynamoDB table is for — and that needs accounts, which Parla does not have.

## Open questions — decide these before building the screens

1. **Auth / identity.** `storage.server.ts` and the Dynamo table assume a
   `userId`, but Parla has no accounts. Options: Sign in with Apple (keeps
   continuity with the iOS user), Cognito, or a hosted provider. This blocks all
   cross-device sync on the web. Until then `storage.client.ts` keeps data
   per-browser, and the web does **not** sync with iPhone/desktop.
2. **Free-tier quota.** The clients count usage in `storage.ts` (5/hour). That is
   unenforceable on the web — a user can clear localStorage. The quota has to be
   counted server-side, per user, which depends on (1).
3. **Transcription payload.** Audio has to go browser → Lambda → Whisper. API
   Gateway caps request bodies at ~6 MB, so a long recording cannot be posted
   inline; likely a presigned S3 PUT and hand Whisper the object. Blocks the mic
   button on the Dialog screen.
4. **Parla Pro on the web.** RevenueCat/StoreKit is iOS-only. A web purchase
   needs a different path (Stripe?). `TODO.md` already lists this as open for
   desktop.
5. **Landing CTA.** Still points at the waitlist form. Once `/app` is real, it
   should link there instead.

## Getting started

```bash
cd sst
npm install
npm install --prefix web

# Set the OpenAI key for your stage (never committed, never sent to the browser)
npx sst secret set OpenAiApiKey sk-...

npx sst dev            # SST + Remix locally
npx sst deploy --stage <stage>
```

Local-only (landing + stub screens, no AWS, no OpenAI):

```bash
cd sst/web && npm run dev
```
