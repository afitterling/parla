# Symbol of the day

Status: implemented (iOS app; desktop has no notifications and no card yet)

## Problem

Learners of a Han-script language (Chinese, Taiwanese Mandarin, Cantonese,
Japanese) need steady exposure to single characters, not only to dialogue.
Nothing in the app reached out to the learner between sessions.

## Behavior

- **Settings → "Symbol of the day"**, shown only when the goal language has a
  character list (`zh`, `zh-TW`, `yue`, `ja`); otherwise a hint says which
  languages qualify. Three tiles: **Off / once a day / 3× a day**, plus
  "Show current symbol". Turning it on asks for notification permission; if
  denied, an alert points to iOS Settings and the setting stays off.
- **Notifications** — local, scheduled a week ahead (re-synced on launch, on
  foreground, and on every settings change). Once a day fires at 09:00; three
  times a day at 09:00, 13:00 and 19:00, each slot a *new* character. Title
  "Symbol of the day: 水", body the reading + "Tap to learn it", in the UI
  language. Banners also show while the app is open.
- **Tapping a notification** (or the 文 logo mark in the header, or the
  Settings button) opens the **symbol card**: the character large, its
  reading, the Coach's explanation (meaning, two example words with reading
  and translation, a memory hook — all in the learner's *input* language),
  stroke-order animation for Han characters, read-aloud, and "Add to
  vocabulary" (term + reading + meaning + first example). ‹ › browse back
  through symbols already handed out; the sequence cannot be read ahead.
- The explanation is one `gpt-4o-mini` call, cached on device per
  (goal language, character, learner language). It counts against the free
  tier's hourly quota; over the limit the card still shows the character and
  reading with a tap-through to the paywall.

## Implementation

- `app/src/symbols.ts` — the lists (HSK-1-ish simplified, traditional via a
  S2T map, Cantonese = traditional without readings, Japanese = hiragana →
  katakana → N5 kanji) and the slot arithmetic (`dayIndex`,
  `currentSlotIndex`, `upcomingSlots`).
- `app/src/notifications.ts` — `expo-notifications` wrapper:
  `syncSymbolNotifications`, permission, response parsing.
- `app/src/api.ts` — `explainSymbol()`; `app/src/storage.ts` — settings
  `dailySymbols` (0|1|3) + `dailySymbolStart` per language, lesson cache in
  AsyncStorage.
- `app/src/components/SymbolCard.tsx`, Settings section, wiring in `App.tsx`.

## Open

- Desktop app: the shared `settings.json` loader there drops unknown fields
  (as it already does for `dialogSort`), so saving settings on the Mac resets
  the feature to off on the phone until it is enabled again.
- Notification times are fixed; a time picker is a possible follow-up.
