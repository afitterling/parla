# Vocab quick-add with auto-translate

Status: implemented (iOS app; desktop follow-up pending)

## Problem

The vocab add card required knowing the full pair (goal-language word +
translation). There was no way to enter just one side and have the other
filled in, and only the goal-language field had a mic.

## Use cases

| # | You know…                        | Flow |
|---|----------------------------------|------|
| A | Full pair                        | Type both fields, save (unchanged) |
| B | Goal word only (e.g. Taiwanese)  | Type or speak the goal word → Translate → translation fills → edit → save |
| C | Input-lang word only (e.g. EN)   | Type or speak the translation → Translate → goal word **+ reading** fill → edit → save |

## Behavior

- **One smart Translate button** in the add card. Visible/enabled only when
  exactly **one** side is filled; it fills the empty side. Both sides filled →
  hidden (nothing is ever overwritten). Direction is inferred.
- **Mic on both fields.** Term mic transcribes with Whisper in the goal
  language (existing), translation mic in the input language. One recording at
  a time; tapping the other mic while recording stops the running one.
- **Reading:** when case C produces a goal word and the goal language has a
  reading system (`romanize`), the reading comes back in the same call, is
  previewed under the term field, and is stored on save. Hand-editing the term
  clears the prefilled reading (it belongs to the generated term).
- **Errors:** same alert pattern as the rest of the app (missing key, network,
  empty transcription).

## Implementation

- `app/src/api.ts` — `translateVocabTerm(key, text, from, to, wantReading)`
  → `{ text, reading? }`; OpenAI chat endpoint, JSON mode, 30s timeout
  (same pattern as `transliterate`).
- `app/src/screens/VocabScreen.tsx` — `micTarget` state routes recording/
  transcription to the right field; shared `MicButton` component;
  `onTranslatePress` infers direction; `termPinyin` state passes the reading
  through `submit()` → `onAdd`.
- `app/src/i18n/index.ts` — `vocab.translate`, `vocab.speakTranslation` in all
  7 UI locales.

## Out of scope (follow-ups)

- Desktop (Electron) port of the same flow.
- Re-translate when both fields are filled (deliberately not offered).
