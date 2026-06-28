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
    ? `\n  "pinyin": "<Umschrift (Pinyin bzw. Romaji) von target als Lesehilfe>",`
    : '';
  const pinyinRule = wantPinyin
    ? `\n- "pinyin": IMMER die korrekte Umschrift von target angeben (Mandarin: Pinyin mit Tönen; Japanisch: Romaji).`
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
    } "translation": "<Bedeutung auf ${input.nativeName}>", "example": "<kurzer Beispielsatz auf ${goal.nativeName}>" }
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
            }))
        : [],
      raw: text,
    };
  }
  // Fallback: model didn't return JSON — show the text as-is.
  return { target: text.trim(), translation: '', vocab: [], raw: text };
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
