// Persistence layer. Data lives as JSON files in the user's iCloud Drive
// (`~/Library/Mobile Documents/com~apple~CloudDocs/Parla/`) via the preload
// bridge, so it syncs across the user's Macs. When the bridge is unavailable
// (e.g. `electron-vite preview` in a plain browser) we fall back to
// localStorage. The API is async throughout — mirroring the mobile app.

export type VocabItem = {
  id: string;
  term: string;
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string;
  example?: string;
  examplePinyin?: string; // reading aid for the example sentence
  exampleTranslation?: string; // example sentence translated into the input language
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
  known: number; // how often marked "known"
};

export type Settings = {
  openaiKey: string;
  inputLanguage: string; // what the learner speaks (Whisper transcription)
  goalLanguage: string; // the language being learned (Parla speaks/teaches)
  showPinyin: boolean; // show Pinyin/Romaji line for Asian goal languages
  isPro: boolean; // Parla Pro — removes the free-tier rate limit
  uiLanguage: string; // app UI language: a UiLang code or 'auto' (device locale)
  defaultMode: 'free' | 'ask'; // which dialog mode starts active: 'free'=Interpreter, 'ask'=Coach
  theme: 'light' | 'dark' | 'system'; // color theme; 'system' follows the OS
};

const VOCAB_FILE = 'vocab.json';
const PHRASE_FILE = 'phrases.json';
const SETTINGS_FILE = 'settings.json';
const USAGE_FILE = 'usage.json';

const HOUR_MS = 3_600_000;

// Free tier: number of conversations (AI replies) allowed per rolling hour.
export const FREE_PER_HOUR = 5;

// Default key baked in from .env (VITE_*). Overridable via a stored setting.
const envOpenai = (import.meta.env.VITE_OPENAI_API_KEY ?? '').trim();

function isPlaceholder(key: string): boolean {
  return !key || key.includes('REPLACE_ME') || key.endsWith('...');
}

// ── Raw file IO (iCloud bridge → localStorage fallback) ────────────────────────
async function readRaw(file: string): Promise<string | null> {
  if (window.parla) {
    try {
      return await window.parla.read(file);
    } catch {
      return null;
    }
  }
  try {
    return localStorage.getItem(`parla:${file}`);
  } catch {
    return null;
  }
}

async function writeRaw(file: string, content: string): Promise<void> {
  if (window.parla) {
    await window.parla.write(file, content);
    return;
  }
  try {
    localStorage.setItem(`parla:${file}`, content);
  } catch {
    // ignore quota errors in the browser-preview fallback
  }
}

// ── Vocab ──────────────────────────────────────────────────────────────────────
export async function loadVocab(): Promise<VocabItem[]> {
  const raw = await readRaw(VOCAB_FILE);
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
  await writeRaw(VOCAB_FILE, JSON.stringify(items, null, 2));
}

// ── Phrases ──────────────────────────────────────────────────────────────────
export async function loadPhrases(): Promise<PhraseItem[]> {
  const raw = await readRaw(PHRASE_FILE);
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
  await writeRaw(PHRASE_FILE, JSON.stringify(items, null, 2));
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

// ── Settings ─────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<Settings> {
  const raw = await readRaw(SETTINGS_FILE);
  const stored: Partial<Settings> & { language?: string } = raw ? safeParse(raw) : {};
  return {
    // The env key is the source of truth (no Settings UI to set it). Only fall
    // back to a previously-stored key if the env value is missing/placeholder.
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
  await writeRaw(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function safeParse(raw: string): Partial<Settings> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Usage tracking (free-tier rate limit) ──────────────────────────────────
// Stored as an array of epoch-ms timestamps, one per conversation.
async function loadUsage(): Promise<number[]> {
  const raw = await readRaw(USAGE_FILE);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr.filter((n) => typeof n === 'number') as number[]) : [];
  } catch {
    return [];
  }
}

async function saveUsage(stamps: number[]): Promise<void> {
  await writeRaw(USAGE_FILE, JSON.stringify(stamps));
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

// Dev runs (electron-vite dev, or VITE_ENV=dev) are exempt from the paywall.
// Only a packaged production build gates non-Pro users.
const IS_DEV_ENV =
  import.meta.env.DEV || (import.meta.env.VITE_ENV ?? '').toLowerCase() === 'dev';

export function isPaywallActive(isPro: boolean): boolean {
  return !IS_DEV_ENV && !isPro;
}
