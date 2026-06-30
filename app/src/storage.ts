import AsyncStorage from '@react-native-async-storage/async-storage';

export type VocabItem = {
  id: string;
  term: string;
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string;
  example?: string;
  lang: string;
  tags: string[];
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
  isPro: boolean; // Parla Pro — removes the free-tier rate limit
  uiLanguage: string; // app UI language: a UiLang code or 'auto' (device locale)
  defaultMode: 'free' | 'ask'; // which dialog mode starts active: 'free'=Interpreter, 'ask'=Coach
  theme: 'light' | 'dark' | 'system'; // color theme; 'system' follows the OS
};

const VOCAB_KEY = 'parla.vocab';
const PHRASE_KEY = 'parla.phrases';
const SETTINGS_KEY = 'parla.settings';
const USAGE_KEY = 'parla.usage';

const HOUR_MS = 3_600_000;

// Free tier: number of conversations (AI replies) allowed per rolling hour.
export const FREE_PER_HOUR = 5;

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
    const items = JSON.parse(raw) as VocabItem[];
    // Be tolerant of older records that predate the tags field.
    return items.map((v) => ({ ...v, tags: Array.isArray(v.tags) ? v.tags : [] }));
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

// Distinct tags ordered by most recent use (newest item that carries them
// first). Powers the tag suggestions in the dialog, editors, and filters. Works
// for any tagged record (phrases or vocab).
export function recentTags(items: { tags: string[]; createdAt: number }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
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
    // Keys are injected from .env.dev (EXPO_PUBLIC_*) at build time and are the
    // source of truth now (no Settings UI to set them). Only fall back to a
    // previously-stored key if the env value is missing/placeholder.
    anthropicKey: !isPlaceholder(envAnthropic) ? envAnthropic : stored.anthropicKey || '',
    openaiKey: !isPlaceholder(envOpenai) ? envOpenai : stored.openaiKey || '',
    inputLanguage: stored.inputLanguage || 'de',
    // migrate the old single `language` field → goal language
    goalLanguage: stored.goalLanguage || stored.language || 'zh',
    showPinyin: stored.showPinyin ?? true,
    isPro: stored.isPro ?? false,
    uiLanguage: stored.uiLanguage || 'auto',
    defaultMode: stored.defaultMode === 'ask' ? 'ask' : 'free',
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
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

// ── Usage tracking (free-tier rate limit) ──────────────────────────────────
// Stored as an array of epoch-ms timestamps, one per conversation.

async function loadUsage(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(USAGE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr.filter((n) => typeof n === 'number') as number[]) : [];
  } catch {
    return [];
  }
}

async function saveUsage(stamps: number[]): Promise<void> {
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(stamps));
}

// Record one usage event now, pruning entries older than one hour.
export async function recordUsage(): Promise<void> {
  const cutoff = Date.now() - HOUR_MS;
  const stamps = (await loadUsage()).filter((t) => t >= cutoff);
  stamps.push(Date.now());
  await saveUsage(stamps);
}

// Count usage events within the last rolling hour (prunes + persists).
export async function usageInLastHour(): Promise<number> {
  const cutoff = Date.now() - HOUR_MS;
  const stamps = (await loadUsage()).filter((t) => t >= cutoff);
  await saveUsage(stamps);
  return stamps.length;
}

// The dev environment (.env.dev sets EXPO_PUBLIC_ENV=dev) and Debug builds are
// exempt from the paywall — even in a standalone Release build. Only a real
// production build (no dev flag) gates non-Pro users.
const IS_DEV_ENV =
  (process.env.EXPO_PUBLIC_ENV ?? '').toLowerCase() === 'dev' || __DEV__;

export function isPaywallActive(isPro: boolean): boolean {
  return !IS_DEV_ENV && !isPro;
}
