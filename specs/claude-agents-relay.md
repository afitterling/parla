# Claude & agents: Sign in with Apple and the MCP relay

Status: implemented (relay + iOS app); **not deployed yet**. Desktop is not covered.

## Problem

The learner runs AI agents (Claude chats, Claude Code sessions, tutors) that come up with vocabulary worth keeping. Getting those words into Parla meant copying them by hand. Agents also could not see what the learner already knows, so they suggested words that were already in the library.

## Behavior

- **Settings → Claude & agents** (section above Backup):
  - **Signed out:** a short explanation and Apple's "Sign in with Apple" button. No name or email is requested; the relay only learns Apple's opaque user id.
  - **Signed in:** "Signed in with Apple · synced hh:mm" and three actions:
    - **Connect an agent** shows an 8-character pairing code (10-minute countdown, single use, tap to copy). It also shows the connector URL (tap to copy) and the steps for Claude: Settings → Connectors → Add custom connector → paste the URL → Connect → type the code.
    - **Sync now**.
    - **Sign out**, after a confirmation. It deletes the relay's copy and disconnects every agent. Words stay in Parla and iCloud.
- **Sync while signed in:**
  - On launch, on returning to the foreground and every 60 s while open, Parla picks up queued requests and adds them.
  - It pushes its library three seconds after any change to the words, the phrases or the languages.
- **What agents can do:**
  - Read: an overview per language, word and phrase search, and request status.
  - Add words and phrases. Duplicates (same language, same text, ignoring case) are skipped.
  - Agents can never edit or delete anything.
- **Tags:** words an agent adds carry the tags it gave. If it gave none, they carry the agent's name (e.g. "Claude"), so they show up in the tag filter and in tag-based quizzes.
- **Build without a relay address** (`expo.extra.relayUrl` empty): the section says the relay is not configured and nothing leaves the device.

## Implementation

- `relay/`: a separate SST app (`parla-relay`, eu-central-1) with API Gateway v2, Lambda and one DynamoDB table. See `relay/README.md` for the routes, the MCP tools and how to deploy. It is ported from `shopping-list/backend` (relay, OAuth, MCP).
- `app/src/relay.ts`: the HTTP client, Sign in with Apple, and the session in the Keychain (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it is never synced through iCloud).
- `app/src/agentIntents.ts`: pure functions that apply a queued request. Ids derive from the request id, so applying the same request twice is a no-op.
- `app/src/useRelay.ts`: the sync loop, wired into `App.tsx`.
- `app/src/components/AgentsSection.tsx`: the Settings UI. Strings live in `app/src/i18n/index.ts` (the `agents.*` keys, all 7 UI languages).
- Native setup:
  - `expo-apple-authentication` and `expo-secure-store` are installed.
  - `ios.usesAppleSignIn` is set, and the `com.apple.developer.applesignin` entitlement is in both `app.json` and `ios/Parla/Parla.entitlements`.

## Still to do

1. Deploy the relay. Then set `relayUrl` in `app/app.json` and ship a new build.
2. Turn on the Sign in with Apple capability for App ID `tech.sp33c.parla.dev` (Developer portal or the App Store Connect API).
3. App Privacy label: the app now sends "User ID" plus the vocabulary content (as "Other user content") to the developer's server while the user is signed in. Not used for tracking.
4. Desktop (Electron): no Sign in with Apple there. It could reuse a pairing-style code later.
