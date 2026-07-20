import AsyncStorage from '@react-native-async-storage/async-storage';
import * as iCloud from '../modules/parla-icloud';

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
  reviews: number; // how often quizzed
  known: number; // how often answered correctly — >0 counts as "learned"
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

// An input→goal language combination the learner has actually saved content
// into. Kept in most-recently-used order so the header menu can offer a quick
// switch back to a pair worked on before.
export type LanguagePair = {
  input: string;
  goal: string;
  usedAt: number;
};

export const MAX_RECENT_PAIRS = 8;

// Put `pair` at the front of the list, dropping any earlier entry for the same
// combination and trimming to MAX_RECENT_PAIRS.
export function rememberPair(
  pairs: LanguagePair[],
  input: string,
  goal: string,
  now: number
): LanguagePair[] {
  const rest = pairs.filter((p) => !(p.input === input && p.goal === goal));
  return [{ input, goal, usedAt: now }, ...rest].slice(0, MAX_RECENT_PAIRS);
}

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
  recentPairs: LanguagePair[]; // language pairs content was saved into, newest first
};

// ── Storage backing ───────────────────────────────────────────────────────────
// Data lives as JSON files in the app's iCloud "Documents" container, which the
// Mac (Electron) app shares — this is what gives cross-device sync. A local
// AsyncStorage mirror keeps everything working offline / when iCloud is signed
// out, and covers migration from the pre-iCloud builds.
//
// File names match the desktop app so both platforms read/write the same files.
const VOCAB_FILE = 'vocab.json';
const PHRASE_FILE = 'phrases.json';
const SETTINGS_FILE = 'settings.json';
const USAGE_FILE = 'usage.json';

// AsyncStorage keys used by pre-iCloud builds — read once so upgrading users keep
// their data (it gets merged into iCloud on first load).
const LEGACY_KEYS: Record<string, string> = {
  [VOCAB_FILE]: 'parla.vocab',
  [PHRASE_FILE]: 'parla.phrases',
  [SETTINGS_FILE]: 'parla.settings',
  [USAGE_FILE]: 'parla.usage',
};

function mirrorKey(file: string): string {
  return `parla.file.${file}`;
}

// Read the iCloud copy (shared with other devices), if any.
async function readCloud(file: string): Promise<string | null> {
  return iCloud.readFile(file);
}

// Read the local copy: the mirror first, then the legacy pre-iCloud key.
async function readLocal(file: string): Promise<string | null> {
  const mirror = await AsyncStorage.getItem(mirrorKey(file));
  if (mirror != null) return mirror;
  return AsyncStorage.getItem(LEGACY_KEYS[file]);
}

// First non-empty of iCloud → mirror → legacy. Used for single-value files
// (settings, usage) where a merge doesn't apply.
async function readRaw(file: string): Promise<string | null> {
  const cloud = await readCloud(file);
  if (cloud != null) return cloud;
  return readLocal(file);
}

// Persist to the local mirror always; push to iCloud best-effort (a failure just
// means we're offline — the mirror still has the data and syncs on the next save).
async function writeRaw(file: string, content: string): Promise<void> {
  await AsyncStorage.setItem(mirrorKey(file), content);
  try {
    await iCloud.writeFile(file, content);
  } catch {
    // offline / iCloud unavailable — mirror holds it
  }
}

function parseArray(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// Number of "meaningful" fields on a record — used to pick the richer copy when
// the same id exists on two devices (e.g. one has an enriched example).
function filledCount(o: Record<string, unknown>): number {
  return Object.values(o).filter(
    (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  ).length;
}

// Union two record lists by id; on a clash keep the copy with more filled fields.
// Never drops an item that exists on either side, so offline edits on either the
// phone or the Mac survive a sync.
function mergeById<T extends { id: string; createdAt?: number }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of a) if (it?.id) map.set(it.id, it);
  for (const it of b) {
    if (!it?.id) continue;
    const existing = map.get(it.id);
    if (!existing) map.set(it.id, it);
    else if (filledCount(it) > filledCount(existing)) map.set(it.id, it);
  }
  return [...map.values()].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
}

// After merging on load, converge both stores if the merge added anything the
// iCloud copy was missing (migration + healing offline divergence).
async function reconcile(file: string, merged: unknown[], cloudCount: number): Promise<void> {
  if (merged.length > 0 && merged.length !== cloudCount) {
    await writeRaw(file, JSON.stringify(merged));
  }
}

const HOUR_MS = 3_600_000;

// Free tier: number of conversations (AI replies) allowed per rolling hour.
export const FREE_PER_HOUR = 5;

// Defaults pulled from .env (EXPO_PUBLIC_*). Overridable in the Settings screen.
const envAnthropic = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const envOpenai = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

function isPlaceholder(key: string): boolean {
  return !key || key.includes('REPLACE_ME') || key.endsWith('...');
}

function normalizeVocab(items: any[]): VocabItem[] {
  // Be tolerant of older records that predate the tags / quiz-stats fields.
  return items.map((v) => ({
    ...v,
    tags: Array.isArray(v.tags) ? v.tags : [],
    reviews: v.reviews ?? 0,
    known: v.known ?? 0,
  })) as VocabItem[];
}

export async function loadVocab(): Promise<VocabItem[]> {
  const cloud = normalizeVocab(parseArray(await readCloud(VOCAB_FILE)));
  const local = normalizeVocab(parseArray(await readLocal(VOCAB_FILE)));
  const merged = mergeById(cloud, local);
  await reconcile(VOCAB_FILE, merged, cloud.length);
  return merged;
}

export async function saveVocab(items: VocabItem[]): Promise<void> {
  await writeRaw(VOCAB_FILE, JSON.stringify(items));
}

function normalizePhrases(items: any[]): PhraseItem[] {
  // Be tolerant of older records that predate the tags/stats fields.
  return items.map((p) => ({
    ...p,
    tags: Array.isArray(p.tags) ? p.tags : [],
    reviews: p.reviews ?? 0,
    known: p.known ?? 0,
  })) as PhraseItem[];
}

export async function loadPhrases(): Promise<PhraseItem[]> {
  const cloud = normalizePhrases(parseArray(await readCloud(PHRASE_FILE)));
  const local = normalizePhrases(parseArray(await readLocal(PHRASE_FILE)));
  const merged = mergeById(cloud, local);
  await reconcile(PHRASE_FILE, merged, cloud.length);
  return merged;
}

export async function savePhrases(items: PhraseItem[]): Promise<void> {
  await writeRaw(PHRASE_FILE, JSON.stringify(items));
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
  const raw = await readRaw(SETTINGS_FILE);
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
    recentPairs: sanitizePairs(stored.recentPairs),
  };
}

// Older builds (and the desktop app) don't write `recentPairs` — accept anything
// shaped right and ignore the rest.
function sanitizePairs(value: unknown): LanguagePair[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p): p is LanguagePair =>
        !!p && typeof p.input === 'string' && typeof p.goal === 'string'
    )
    .map((p) => ({ input: p.input, goal: p.goal, usedAt: Number(p.usedAt) || 0 }))
    .slice(0, MAX_RECENT_PAIRS);
}

export async function saveSettings(s: Settings): Promise<void> {
  await writeRaw(SETTINGS_FILE, JSON.stringify(s));
}

function safeParse(raw: string): Partial<Settings> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Quiz preferences ────────────────────────────────────────────────────────
// How a quiz session picks its cards. Remembered per scope ('vocab' | 'phrases')
// so starting the next session is a single tap.

export type QuizScope = 'vocab' | 'phrases' | 'train';

// How a flashcard is answered: tap to reveal (recognition) or type the answer
// out (recall). Only the trainer offers the choice — the quiz is always typed.
export type AnswerMode = 'reveal' | 'type';

// 'recent' = added in the last QUIZ_RECENT_DAYS days, 'mix' = round-robin across
// tags so every topic shows up, 'tags' = only the tags picked in `tags`,
// 'random' = the whole collection.
export type QuizSource = 'recent' | 'mix' | 'tags' | 'random';

// What the quiz card shows and what you type back:
//  'toWord'    — meaning shown, type the word (characters or its romanization)
//  'toReading' — word shown, type the romanization (romanized languages only)
//  'toMeaning' — word shown, type the meaning
export type QuizDirection = 'toWord' | 'toReading' | 'toMeaning';

export type QuizPrefs = {
  direction: QuizDirection;
  source: QuizSource;
  tags: string[]; // used by source 'tags'
  count: number; // cards per session; 0 = all
  skipLearned: boolean; // leave out items already answered correctly
  answerMode: AnswerMode; // trainer only
};

export const QUIZ_RECENT_DAYS = 10;
export const QUIZ_COUNTS = [10, 20, 50, 0]; // 0 = all

export const DEFAULT_QUIZ_PREFS: QuizPrefs = {
  direction: 'toWord',
  source: 'random',
  tags: [],
  count: 20,
  skipLearned: true,
  answerMode: 'reveal',
};

const QUIZ_FILE = 'quiz.json';

function sanitizePrefs(value: any): QuizPrefs {
  const sources: QuizSource[] = ['recent', 'mix', 'tags', 'random'];
  const directions: QuizDirection[] = ['toWord', 'toReading', 'toMeaning'];
  return {
    direction: directions.includes(value?.direction)
      ? value.direction
      : DEFAULT_QUIZ_PREFS.direction,
    source: sources.includes(value?.source) ? value.source : DEFAULT_QUIZ_PREFS.source,
    tags: Array.isArray(value?.tags) ? value.tags.filter((t: any) => typeof t === 'string') : [],
    count: QUIZ_COUNTS.includes(Number(value?.count))
      ? Number(value.count)
      : DEFAULT_QUIZ_PREFS.count,
    skipLearned: value?.skipLearned ?? DEFAULT_QUIZ_PREFS.skipLearned,
    answerMode: value?.answerMode === 'type' ? 'type' : 'reveal',
  };
}

async function loadAllQuizPrefs(): Promise<Record<string, any>> {
  const raw = await readRaw(QUIZ_FILE);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export async function loadQuizPrefs(scope: QuizScope): Promise<QuizPrefs> {
  return sanitizePrefs((await loadAllQuizPrefs())[scope]);
}

export async function saveQuizPrefs(scope: QuizScope, prefs: QuizPrefs): Promise<void> {
  const all = await loadAllQuizPrefs();
  await writeRaw(QUIZ_FILE, JSON.stringify({ ...all, [scope]: prefs }));
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

// The dev environment (.env.dev sets EXPO_PUBLIC_ENV=dev) and Debug builds are
// exempt from the paywall — even in a standalone Release build. Only a real
// production build (no dev flag) gates non-Pro users.
const IS_DEV_ENV = (process.env.EXPO_PUBLIC_ENV ?? '').toLowerCase() === 'dev' || __DEV__;

export function isPaywallActive(isPro: boolean): boolean {
  return !IS_DEV_ENV && !isPro;
}

// Whether the shared iCloud store is active right now (for a Settings indicator).
export async function iCloudStatus(): Promise<{ linked: boolean; available: boolean }> {
  return { linked: iCloud.isLinked(), available: await iCloud.isAvailable() };
}
