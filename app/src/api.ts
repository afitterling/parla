import { File, UploadType } from 'expo-file-system';
import { Language } from './languages';

// Combine an optional external cancel signal with an internal timeout into one
// signal, so requests can be cancelled by the user OR time out.
function linkSignals(external: AbortSignal | undefined, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener?.('abort', onAbort);
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener?.('abort', onAbort);
    },
  };
}

// ── Whisper (OpenAI) transcription ───────────────────────────────────────────
// Speech-to-text runs through OpenAI's Whisper. We use expo-file-system's native
// File.upload() (multipart, NSURLSession-backed). This avoids two SDK 56 traps:
// the WinterCG fetch rejects RN's {uri,name,type} FormData part ("Unsupported
// FormDataPart") and also fails on a File/Blob body ("request failed"); legacy
// uploadAsync hangs. The native upload takes an AbortSignal so the 30s timeout
// actually cancels the request. We also surface the recording size and the HTTP
// status/body so failures are diagnosable instead of a silent hang.
export async function transcribeAudio(
  uri: string,
  openaiKey: string,
  lang: Language,
  signal?: AbortSignal
): Promise<string> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  const file = new File(uri);
  const size = (file.exists ? file.size : 0) ?? 0;
  if (size < 1200) {
    throw new Error(`Aufnahme leer/zu kurz (${size} B) — etwas länger sprechen.`);
  }

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Abgebrochen.');
    const { signal: s, done } = linkSignals(signal, 60000);
    let res;
    try {
      res = await file.upload('https://api.openai.com/v1/audio/transcriptions', {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        parameters: { model: 'whisper-1', language: lang.whisper },
        headers: { Authorization: `Bearer ${openaiKey}` },
        // Force an immediate foreground upload — the default 'background'
        // NSURLSession defers the transfer, which makes the request appear to
        // hang and then hit the 30s timeout.
        sessionType: 'foreground',
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
    let data: any = {};
    try {
      data = JSON.parse(res.body);
    } catch {
      // non-JSON body handled below
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        data?.error?.message || `Whisper-Fehler ${res.status}: ${String(res.body).slice(0, 120)}`
      );
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

  // For "AI fragt mich" with no prior turns, send a hidden kickoff so the AI
  // opens the dialogue.
  const turns: ChatTurn[] =
    history.length > 0
      ? history
      : [{ role: 'user', content: 'Lass uns anfangen. Stell mir bitte deine erste Frage.' }];

  const body = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 1024,
    // Ask for a strict JSON object — the system prompt mentions "JSON",
    // which this response_format requires.
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

// ── Generate an example sentence for a saved vocabulary word ──────────────────
// The Vocabulary screen uses this to enrich a word with a natural example
// sentence, its transliteration (Pinyin/Romaji, when the goal language uses one),
// and a translation into the learner's language.
export type VocabExample = {
  termPinyin?: string; // transliteration of the word itself (fills a missing word pinyin)
  example: string;
  examplePinyin?: string;
  exampleTranslation?: string;
};

export async function generateVocabExample(
  openaiKey: string,
  term: string,
  goalLang: Language,
  inputLang: Language,
  wantPinyin: boolean,
  signal?: AbortSignal
): Promise<VocabExample> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  const termPinyinField = wantPinyin
    ? `\n  "termPinyin": "<lateinische Umschrift/Transliteration des Wortes/der Wendung selbst>",`
    : '';
  const pinyinField = wantPinyin
    ? `\n  "examplePinyin": "<lateinische Umschrift/Transliteration des Beispielsatzes als Lesehilfe>",`
    : '';
  const pinyinRule = wantPinyin
    ? `\n- "termPinyin" und "examplePinyin": IMMER die lateinische Umschrift (des Wortes bzw. des Beispielsatzes) im gängigen System der Zielsprache (Mandarin: Pinyin mit Tönen, Japanisch: Romaji, Koreanisch: Romaja, usw.).`
    : '';
  const system = `Du bist ein Sprachlehrer für ${goalLang.label} (${goalLang.nativeName}). Bilde EINEN kurzen, natürlichen Beispielsatz für Anfänger, der das gegebene Wort bzw. die Wendung enthält.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form (keine Code-Fences, kein Text davor oder danach):
{${termPinyinField}
  "example": "<kurzer Beispielsatz auf ${goalLang.nativeName}, der das Wort enthält>",${pinyinField}
  "exampleTranslation": "<Übersetzung des Beispielsatzes auf ${inputLang.nativeName}>"
}

Regeln:
- Der Satz MUSS das gegebene Wort/die Wendung enthalten.
- Kurz, klar und auf Anfängerniveau.${pinyinRule}
- Gib niemals etwas außerhalb des JSON-Objekts aus.${
    goalLang.promptHint ? `\n- ${goalLang.promptHint}` : ''
  }`;

  const body = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: term },
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
  if (!json || typeof json.example !== 'string' || !json.example.trim()) {
    throw new Error('Kein Beispielsatz erhalten — bitte nochmal versuchen.');
  }
  return {
    termPinyin:
      wantPinyin && typeof json.termPinyin === 'string' && json.termPinyin.trim()
        ? String(json.termPinyin).trim()
        : undefined,
    example: String(json.example).trim(),
    examplePinyin:
      wantPinyin && typeof json.examplePinyin === 'string' && json.examplePinyin.trim()
        ? String(json.examplePinyin).trim()
        : undefined,
    exampleTranslation:
      typeof json.exampleTranslation === 'string' && json.exampleTranslation.trim()
        ? String(json.exampleTranslation).trim()
        : undefined,
  };
}

// ── Transliteration only ─────────────────────────────────────────────────────
// Backfills the reading (Pinyin/Romaji/…) of a single word or phrase that was
// saved without one — e.g. typed in by hand, or saved while the Pinyin toggle
// was off. Deliberately narrower (and cheaper) than generateVocabExample.
export async function transliterate(
  openaiKey: string,
  term: string,
  goalLang: Language,
  signal?: AbortSignal
): Promise<string> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  const system = `Du transliterierst ${goalLang.label} (${goalLang.nativeName}) in lateinische Schrift.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form (keine Code-Fences, kein Text davor oder danach):
{ "pinyin": "<lateinische Umschrift des gegebenen Wortes/Satzes>" }

Regeln:
- Nutze das gängige System der Zielsprache (Mandarin: Pinyin mit Tönen, Japanisch: Romaji, Koreanisch: Romaja, Russisch/Griechisch/Arabisch/Hebräisch/Thai/Hindi usw.: übliche Transliteration).
- Nur die Umschrift, keine Übersetzung und keine Erklärung.${
    goalLang.promptHint ? `\n- ${goalLang.promptHint}` : ''
  }`;

  const { signal: s, done } = linkSignals(signal, 30000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: term },
        ],
      }),
      signal: s,
    });
  } finally {
    done();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);

  const json = extractJson(data?.choices?.[0]?.message?.content ?? '');
  const pinyin = typeof json?.pinyin === 'string' ? json.pinyin.trim() : '';
  if (!pinyin) throw new Error('Keine Umschrift erhalten — bitte nochmal versuchen.');
  return pinyin;
}

// ── Translate a single vocab term ────────────────────────────────────────────
// The add card lets the learner enter only ONE side of the pair (either the
// goal-language word or its translation); this fills in the other side. When
// the target is the goal language and it uses a reading aid, the reading is
// returned too, so the word is saved complete without a second call.
export async function translateVocabTerm(
  openaiKey: string,
  text: string,
  from: Language,
  to: Language,
  wantReading: boolean,
  signal?: AbortSignal
): Promise<{ text: string; reading?: string }> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  const readingField = wantReading
    ? `\n  "reading": "<lateinische Umschrift/Transliteration der Übersetzung>",`
    : '';
  const readingRule = wantReading
    ? `\n- "reading": IMMER die lateinische Umschrift der Übersetzung im gängigen System der Zielsprache (Mandarin: Pinyin mit Tönen, Japanisch: Romaji, Koreanisch: Romaja, usw.).`
    : '';
  const system = `Du bist ein Wörterbuch von ${from.label} (${from.nativeName}) nach ${to.label} (${to.nativeName}). Übersetze das gegebene Wort bzw. die kurze Wendung.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form (keine Code-Fences, kein Text davor oder danach):
{${readingField}
  "translation": "<die gebräuchlichste Übersetzung auf ${to.nativeName}>"
}

Regeln:
- Gib die EINE gebräuchlichste Übersetzung, keine Alternativen, keine Erklärung.
- Nur das Wort/die Wendung selbst — kein ganzer Satz, keine Satzzeichen.${readingRule}
- Gib niemals etwas außerhalb des JSON-Objekts aus.${
    to.promptHint ? `\n- ${to.promptHint}` : ''
  }`;

  const { signal: s, done } = linkSignals(signal, 30000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
      signal: s,
    });
  } finally {
    done();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);

  const json = extractJson(data?.choices?.[0]?.message?.content ?? '');
  const translation = typeof json?.translation === 'string' ? json.translation.trim() : '';
  if (!translation) throw new Error('Keine Übersetzung erhalten — bitte nochmal versuchen.');
  return {
    text: translation,
    reading:
      wantReading && typeof json?.reading === 'string' && json.reading.trim()
        ? String(json.reading).trim()
        : undefined,
  };
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
