import { Language } from './languages';

// ── Whisper (OpenAI) transcription ───────────────────────────────────────────
// In Electron (Chromium, webSecurity off) standard fetch + FormData with a Blob
// works directly — no Expo/WinterCG quirks like on mobile.
export async function transcribeAudio(
  blob: Blob,
  openaiKey: string,
  lang: Language
): Promise<string> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');
  if (!blob || blob.size < 1200) {
    throw new Error(`Aufnahme leer/zu kurz (${blob?.size ?? 0} B) — etwas länger sprechen.`);
  }

  const form = new FormData();
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'ogg';
  form.append('file', blob, `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', lang.whisper);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Whisper-Fehler (${res.status})`);
    return (data.text ?? '').trim();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Whisper-Timeout (30s) — nochmal versuchen.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── OpenAI dialogue ──────────────────────────────────────────────────────────
const CHAT_MODEL = 'gpt-4o-mini';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type VocabSuggestion = { term: string; translation: string; example?: string };
export type DialogReply = {
  target: string;
  pinyin?: string;
  translation: string;
  vocab: VocabSuggestion[];
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
      : `Du bist ein freundlicher Gesprächspartner und Tutor für ${goal.label} (${goal.nativeName}). Antworte natürlich auf das, was der Lernende sagt. Wenn der Lernende nach der Bedeutung oder Erklärung von etwas fragt („was ist/bedeutet X?"), gib eine präzise, klare Definition oder Beschreibung — kurz, korrekt und auf das Wesentliche.`;

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
  "target": "<deine Gesprächsantwort auf ${goal.nativeName}, 1-2 Sätze>",${pinyinField}
  "translation": "<Übersetzung von target auf ${input.nativeName}>",
  "vocab": [
    { "term": "<nützliches Wort/Wendung aus target auf ${goal.nativeName}>", "translation": "<Bedeutung auf ${input.nativeName}>", "example": "<kurzer Beispielsatz auf ${goal.nativeName}>" }
  ]
}

Regeln:
- Passe das Niveau an einen Anfänger an: kurze, klare Sätze.
- "vocab": 1 bis 3 wirklich nützliche Wörter aus deiner Antwort. Wenn nichts Neues, gib [] zurück.
- Erklärungen, Definitionen und Beschreibungen von Wörtern, Wendungen oder Dingen sind ausdrücklich erwünscht — das ist Teil des Sprachenlernens.
- Nur klar fachfremde Aufgaben (z.B. Programmierung, Politik, persönliche/medizinische Beratung) NICHT inhaltlich beantworten — stattdessen in "target" höflich und auf ${goal.nativeName} zurück zur Sprachübung lenken.
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
  wantPinyin: boolean
): Promise<DialogReply> {
  if (!openaiKey) throw new Error('Kein OpenAI-Key gesetzt (Settings).');

  const turns: ChatTurn[] =
    history.length > 0
      ? history
      : [{ role: 'user', content: 'Lass uns anfangen. Stell mir bitte deine erste Frage.' }];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(goalLang, inputLang, mode, wantPinyin) },
        ...turns,
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-Fehler (${res.status})`);
  return parseDialogReply(data?.choices?.[0]?.message?.content ?? '');
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
              translation: String(v.translation ?? ''),
              example: v.example ? String(v.example) : undefined,
            }))
        : [],
      raw: text,
    };
  }
  return { target: text.trim(), translation: '', vocab: [], raw: text };
}

function extractJson(text: string): any | null {
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
