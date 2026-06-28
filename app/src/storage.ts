import AsyncStorage from '@react-native-async-storage/async-storage';

export type VocabItem = {
  id: string;
  term: string;
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string;
  example?: string;
  lang: string;
  createdAt: number;
};

export type PhraseItem = {
  id: string;
  target: string; // the phrase in the target language
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string; // translation into the input language
  lang: string;
  tags: string[];
  createdAt: number;
  reviews: number; // how often trained
  known: number; // how often marked "gewusst"
};

export type Settings = {
  anthropicKey: string;
  openaiKey: string;
  inputLanguage: string; // what the learner speaks (Whisper transcription)
  goalLanguage: string; // the language being learned (Parla speaks/teaches)
  showPinyin: boolean; // show Pinyin/Romaji line for Asian goal languages
};

const VOCAB_KEY = 'parla.vocab';
const PHRASE_KEY = 'parla.phrases';
const SETTINGS_KEY = 'parla.settings';

// Defaults pulled from .env (EXPO_PUBLIC_*). Overridable in the Settings screen.
const envAnthropic = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const envOpenai = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

function isPlaceholder(key: string): boolean {
  return !key || key.includes('REPLACE_ME') || key.endsWith('...');
}

export async function loadVocab(): Promise<VocabItem[]> {
  const raw = await AsyncStorage.getItem(VOCAB_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as VocabItem[];
  } catch {
    return [];
  }
}

export async function saveVocab(items: VocabItem[]): Promise<void> {
  await AsyncStorage.setItem(VOCAB_KEY, JSON.stringify(items));
}

export async function loadPhrases(): Promise<PhraseItem[]> {
  const raw = await AsyncStorage.getItem(PHRASE_KEY);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw) as PhraseItem[];
    // Be tolerant of older records that predate the tags/stats fields.
    return items.map((p) => ({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags : [],
      reviews: p.reviews ?? 0,
      known: p.known ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function savePhrases(items: PhraseItem[]): Promise<void> {
  await AsyncStorage.setItem(PHRASE_KEY, JSON.stringify(items));
}

// Distinct tags ordered by most recent use (newest phrase that carries them
// first). Powers the tag suggestions in the dialog, editor, and filters.
export function recentTags(phrases: PhraseItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...phrases].sort((a, b) => b.createdAt - a.createdAt)) {
    for (const tag of p.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(tag);
      }
    }
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const stored: Partial<Settings> & { language?: string } = raw ? safeParse(raw) : {};
  return {
    anthropicKey: stored.anthropicKey || (isPlaceholder(envAnthropic) ? '' : envAnthropic),
    openaiKey: stored.openaiKey || (isPlaceholder(envOpenai) ? '' : envOpenai),
    inputLanguage: stored.inputLanguage || 'de',
    // migrate the old single `language` field → goal language
    goalLanguage: stored.goalLanguage || stored.language || 'zh',
    showPinyin: stored.showPinyin ?? true,
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function safeParse(raw: string): Partial<Settings> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
