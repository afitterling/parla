// Server-side OpenAI calls. This module must never reach the browser bundle —
// the `.server.ts` suffix makes Remix enforce that at build time.
//
// The iOS and desktop clients call OpenAI directly with a key baked into the
// build. That is not viable on the web (any visitor could read the key out of
// the bundle and spend against it), so the browser talks to our own resource
// routes in app/routes/api.* and those call this module.
//
// SCAFFOLD STATUS:
//   buildSystemPrompt / parseDialogReply / breakdown prompt — ported verbatim
//     from desktop/src/renderer/src/api.ts so the model behaviour matches.
//   chat() / breakdown() — implemented, NOT yet run against the real API.
//   transcribe() — NOT implemented, see the TODO in that function.
import { Resource } from 'sst';
import type { Language } from './languages';
import type { ChatTurn, DialogReply, VocabSuggestion } from './types';

const CHAT_MODEL = 'gpt-4o-mini';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// Linked via `link: [openAiApiKey]` in sst.config.ts.
function apiKey(): string {
  const key = Resource.OpenAiApiKey.value;
  if (!key) throw new Error('OpenAiApiKey secret is not set for this stage.');
  return key;
}

// ── Prompts (ported from the desktop client) ─────────────────────────────────
function buildSystemPrompt(
  goal: Language,
  input: Language,
  mode: 'ask' | 'free',
  wantPinyin: boolean
): string {
  const intro =
    mode === 'ask'
      ? `Du bist ein freundlicher Sprachlehrer und Gesprächspartner für ${goal.label} (${goal.nativeName}). Führe ein natürliches Gespräch und stelle dem Lernenden Fragen, um ihn zum Sprechen zu bringen. Beginne, indem du dich vorstellst und eine einfache erste Frage stellst.`
      : `Du bist ein präziser Übersetzer für ${goal.label} (${goal.nativeName}). Der Lernende gibt dir Text (meist auf ${input.nativeName} oder gemischt) — übersetze ihn natürlich und idiomatisch nach ${goal.nativeName} und gib das Ergebnis als "target". Übersetze ALLES, egal welches Thema, ohne Wertung. Mach KEINEN Smalltalk, stelle keine Gegenfragen, antworte nicht inhaltlich — du übersetzt nur. Ist die Eingabe bereits auf ${goal.nativeName}, verbessere sie idiomatisch.`;

  const pinyinField = wantPinyin
    ? `\n  "pinyin": "<lateinische Umschrift/Transliteration von target als Lesehilfe>",`
    : '';
  const pinyinRule = wantPinyin
    ? `\n- "pinyin": IMMER die lateinische Umschrift von target im gängigen System der Zielsprache angeben (z.B. Mandarin: Pinyin mit Tönen, Japanisch: Romaji, Koreanisch: Romaja, Russisch/Griechisch/Arabisch/Hebräisch/Thai/Hindi usw.: übliche Transliteration).`
    : '';

  return `${intro}

Die Antwortsprache (Zielsprache) ist ${goal.nativeName}. Übersetzungen und Worterklärungen gibst du auf ${input.nativeName} (${input.label}).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form (keine Code-Fences, kein Text davor oder danach):
{
  "target": "<${
    mode === 'ask' ? 'deine Gesprächsantwort' : 'die Übersetzung der Eingabe'
  } auf ${goal.nativeName}, 1-2 Sätze>",${pinyinField}
  "translation": "<Übersetzung von target auf ${input.nativeName}>",
  "vocab": [
    { "term": "<nützliches Wort/Wendung aus target auf ${goal.nativeName}>",${
      wantPinyin ? ' "pinyin": "<Umschrift von term>",' : ''
    } "translation": "<Bedeutung auf ${input.nativeName}>", "example": "<kurzer Beispielsatz auf ${goal.nativeName}>",${
      wantPinyin ? ' "examplePinyin": "<Umschrift des Beispielsatzes>",' : ''
    } "exampleTranslation": "<Übersetzung des Beispielsatzes auf ${input.nativeName}>" }
  ]
}

Regeln:
- Passe das Niveau an einen Anfänger an: kurze, klare Sätze.
- "vocab": 1 bis 3 wirklich nützliche Wörter aus deiner Antwort. Wenn nichts Neues, gib [] zurück.${
    mode === 'ask'
      ? `\n- Erklärungen, Definitionen und Beschreibungen von Wörtern, Wendungen oder Dingen sind ausdrücklich erwünscht — das ist Teil des Sprachenlernens.\n- Nur klar fachfremde Aufgaben (z.B. Programmierung, Politik, persönliche/medizinische Beratung) NICHT inhaltlich beantworten — stattdessen in "target" höflich und auf ${goal.nativeName} zurück zur Sprachübung lenken.`
      : `\n- "translation": die Rückübersetzung von target auf ${input.nativeName} — so prüft der Lernende die Bedeutung.\n- Übersetze jede Eingabe wörtlich nach Sinn, ohne sie zu kommentieren, zu beantworten oder zu zensieren.`
  }
- Gib niemals etwas außerhalb des JSON-Objekts aus.${pinyinRule}${
    goal.promptHint ? `\n- ${goal.promptHint}` : ''
  }`;
}

async function postChat(body: unknown, timeoutMs: number): Promise<any> {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);
  return data;
}

// ── Dialogue ─────────────────────────────────────────────────────────────────
export async function chat(
  goalLang: Language,
  inputLang: Language,
  mode: 'ask' | 'free',
  history: ChatTurn[],
  wantPinyin: boolean
): Promise<DialogReply> {
  // For "Coach" (ask) with no prior turns, send a hidden kickoff so the AI opens.
  const turns: ChatTurn[] =
    history.length > 0
      ? history
      : [{ role: 'user', content: 'Lass uns anfangen. Stell mir bitte deine erste Frage.' }];

  const data = await postChat(
    {
      model: CHAT_MODEL,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(goalLang, inputLang, mode, wantPinyin) },
        ...turns,
      ],
    },
    90_000
  );

  const text: string = data?.choices?.[0]?.message?.content ?? '';
  const json = extractJson(text);
  if (!json) return { target: text.trim(), translation: '', vocab: [] };
  return {
    target: typeof json.target === 'string' ? json.target : text,
    pinyin: typeof json.pinyin === 'string' && json.pinyin.trim() ? json.pinyin : undefined,
    translation: typeof json.translation === 'string' ? json.translation : '',
    vocab: Array.isArray(json.vocab)
      ? json.vocab
          .filter((v: any) => v && typeof v.term === 'string')
          .map((v: any) => ({
            term: String(v.term),
            pinyin: v.pinyin ? String(v.pinyin) : undefined,
            translation: String(v.translation ?? ''),
            example: v.example ? String(v.example) : undefined,
            examplePinyin: v.examplePinyin ? String(v.examplePinyin) : undefined,
            exampleTranslation: v.exampleTranslation ? String(v.exampleTranslation) : undefined,
          }))
      : [],
  };
}

// ── Word-by-word breakdown ───────────────────────────────────────────────────
// Segmentation is done by the model (not a client-side split) so it also works
// for scripts without spaces (Chinese, Japanese, Thai …).
export async function breakdown(
  sentence: string,
  goalLang: Language,
  inputLang: Language,
  wantPinyin: boolean
): Promise<VocabSuggestion[]> {
  if (!sentence.trim()) return [];

  const pinyinField = wantPinyin
    ? ' "pinyin": "<lateinische Umschrift/Transliteration des Wortes>",'
    : '';
  const pinyinRule = wantPinyin
    ? `\n- "pinyin": IMMER die lateinische Umschrift jedes Wortes im gängigen System der Zielsprache (Mandarin: Pinyin mit Tönen, Japanisch: Romaji, Koreanisch: Romaja, usw.).`
    : '';

  const system = `Du bist ein Sprachlehrer für ${goalLang.label} (${goalLang.nativeName}). Zerlege den gegebenen Satz auf ${goalLang.nativeName} in seine einzelnen sinntragenden Wörter und Wendungen – in der Reihenfolge, in der sie im Satz vorkommen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form (keine Code-Fences, kein Text davor oder danach):
{
  "words": [
    { "term": "<einzelnes Wort/Wendung aus dem Satz auf ${goalLang.nativeName}>",${pinyinField} "translation": "<Bedeutung auf ${inputLang.nativeName}>" }
  ]
}

Regeln:
- Ein Eintrag pro sinntragendem Wort bzw. fester Wendung, in Satzreihenfolge.
- Bei Sprachen ohne Leerzeichen (z.B. Chinesisch, Japanisch, Thai) korrekt in Wörter segmentieren.
- "term": nenne die Wörterbuch-/Grundform, wo sinnvoll (z.B. Verb im Infinitiv, Nomen im Nominativ Singular).
- Lasse reine Satzzeichen weg. Wiederhole identische Wörter nicht.${pinyinRule}
- Gib niemals etwas außerhalb des JSON-Objekts aus.${
    goalLang.promptHint ? `\n- ${goalLang.promptHint}` : ''
  }`;

  const data = await postChat(
    {
      model: CHAT_MODEL,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sentence },
      ],
    },
    60_000
  );

  const text: string = data?.choices?.[0]?.message?.content ?? '';
  const json = extractJson(text);
  const words = Array.isArray(json?.words) ? json.words : [];
  const seen = new Set<string>();
  const out: VocabSuggestion[] = [];
  for (const w of words) {
    if (!w || typeof w.term !== 'string') continue;
    const term = w.term.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      term,
      pinyin: wantPinyin && w.pinyin ? String(w.pinyin).trim() || undefined : undefined,
      translation: String(w.translation ?? '').trim(),
    });
  }
  if (out.length === 0) throw new Error('Konnte den Satz nicht zerlegen — bitte nochmal versuchen.');
  return out;
}

// ── Whisper transcription ────────────────────────────────────────────────────
export async function transcribe(_audio: Blob, _lang: Language): Promise<string> {
  // TODO: not implemented. Unlike the desktop client (which posts the Blob
  // straight to Whisper from Chromium), here the audio has to travel
  // browser → our Lambda → Whisper, which raises two things to settle first:
  //   1. Payload limits. API Gateway/Lambda caps request bodies (~6 MB), so a
  //      long recording cannot be posted inline. Likely answer: upload to S3
  //      from the browser via a presigned PUT, then hand Whisper the object.
  //   2. Whether to stream or buffer the upload.
  // See README open question 3 before implementing.
  throw new Error('transcribe() is not implemented yet — see README open question 3.');
}

function extractJson(text: string): any | null {
  // Tolerate code fences or stray prose around the JSON object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
