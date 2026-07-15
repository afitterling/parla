import { Language } from './languages';

// Combine an optional external cancel signal with an internal timeout into one
// signal, so requests can be cancelled by the user OR time out.
function linkSignals(external: AbortSignal | undefined, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', onAbort);
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

// ── Whisper (OpenAI) transcription ───────────────────────────────────────────
// In Electron (Chromium, webSecurity off) a standard multipart fetch with a
// Blob body works directly — none of the WinterCG/FormData quirks the mobile
// build hits. Takes an AbortSignal so the 60s timeout (or a user cancel) can
// abort the request.
export async function transcribeAudio(
  blob: Blob,
  openaiKey: string,
  lang: Language,
  signal?: AbortSignal
): Promise<string> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');
  if (!blob || blob.size < 1200) {
    throw new Error(`Aufnahme leer/zu kurz (${blob?.size ?? 0} B) — etwas länger sprechen.`);
  }

  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'ogg';

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Abgebrochen.');
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', lang.whisper);

    const { signal: s, done } = linkSignals(signal, 60000);
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
        signal: s,
      });
    } catch (e: any) {
      done();
      lastErr = e;
      if (signal?.aborted) throw new Error('Abgebrochen.');
      if (e?.name === 'AbortError') break; // internal timeout → stop
      continue; // transient network error → retry once
    }
    done();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Whisper-Fehler (${res.status})`);
    }
    return (data.text ?? '').trim();
  }
  throw new Error(
    lastErr?.name === 'AbortError'
      ? 'Whisper-Timeout (60s) — nochmal versuchen oder abbrechen.'
      : 'Netzwerkfehler — bitte nochmal versuchen.'
  );
}

// ── OpenAI dialogue ──────────────────────────────────────────────────────────
// Both transcription (Whisper) and the dialogue run on the one OpenAI key.
const CHAT_MODEL = 'gpt-4o-mini';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type VocabSuggestion = {
  term: string;
  pinyin?: string;
  translation: string;
  example?: string;
  examplePinyin?: string; // transliteration of the example sentence
  exampleTranslation?: string; // example sentence translated into the input language
};

export type DialogReply = {
  target: string; // assistant line in the goal language
  pinyin?: string; // pronunciation aid (Pinyin/Romaji) for Asian goal languages
  translation: string; // translation into the input language
  vocab: VocabSuggestion[]; // 0–3 useful words from the line
  raw: string;
};

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

export async function chatWithAI(
  openaiKey: string,
  goalLang: Language,
  inputLang: Language,
  mode: 'ask' | 'free',
  history: ChatTurn[],
  wantPinyin: boolean,
  signal?: AbortSignal
): Promise<DialogReply> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  // For "Coach" (ask) with no prior turns, send a hidden kickoff so the AI
  // opens the dialogue.
  const turns: ChatTurn[] =
    history.length > 0
      ? history
      : [{ role: 'user', content: 'Lass uns anfangen. Stell mir bitte deine erste Frage.' }];

  const body = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(goalLang, inputLang, mode, wantPinyin) },
      ...turns,
    ],
  });

  // Timeout + one retry so the dialogue never hangs forever on a slow/flaky
  // network and recovers from a transient "fetch failed".
  let res: Response | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Abgebrochen.');
    const { signal: s, done } = linkSignals(signal, 90000);
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body,
        signal: s,
      });
      done();
      lastErr = null;
      break;
    } catch (e: any) {
      done();
      lastErr = e;
      if (signal?.aborted) throw new Error('Abgebrochen.');
      if (e?.name === 'AbortError') break; // our timeout — don't keep retrying
      // transient network error → loop retries once more
    }
  }
  if (!res) {
    throw new Error(
      lastErr?.name === 'AbortError'
        ? 'Zeitüberschreitung — Netzwerk langsam. Nochmal versuchen.'
        : 'Netzwerkfehler — bitte nochmal versuchen.'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);
  }

  const text: string = data?.choices?.[0]?.message?.content ?? '';
  return parseDialogReply(text);
}

function parseDialogReply(text: string): DialogReply {
  const json = extractJson(text);
  if (json) {
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
      raw: text,
    };
  }
  // Fallback: model didn't return JSON — show the text as-is.
  return { target: text.trim(), translation: '', vocab: [], raw: text };
}

// ── Break a sentence into its individual words/terms ─────────────────────────
// The dialogue offers a "word for word" action on a translated sentence: it
// segments the goal-language sentence into its meaningful words/expressions so
// the learner can add each one to the dictionary. Runs through the same chat
// endpoint. Segmentation is done by the model (not a client-side split) so it
// also works for scripts without spaces (Chinese, Japanese, Thai …).
export async function breakdownSentence(
  openaiKey: string,
  sentence: string,
  goalLang: Language,
  inputLang: Language,
  wantPinyin: boolean,
  signal?: AbortSignal
): Promise<VocabSuggestion[]> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');
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

  const body = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 900,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: sentence },
    ],
  });

  let res: Response | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Abgebrochen.');
    const { signal: s, done } = linkSignals(signal, 60000);
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body,
        signal: s,
      });
      done();
      lastErr = null;
      break;
    } catch (e: any) {
      done();
      lastErr = e;
      if (signal?.aborted) throw new Error('Abgebrochen.');
      if (e?.name === 'AbortError') break; // our timeout — don't keep retrying
    }
  }
  if (!res) {
    throw new Error(
      lastErr?.name === 'AbortError'
        ? 'Zeitüberschreitung — Netzwerk langsam. Nochmal versuchen.'
        : 'Netzwerkfehler — bitte nochmal versuchen.'
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);

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
