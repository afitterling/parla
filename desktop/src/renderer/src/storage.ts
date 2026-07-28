// Persistence layer. Data lives as JSON files in the iOS app's iCloud
// "Documents" container (see main/index.ts), shared with the iPhone/iPad app,
// so it syncs across the user's Macs AND with mobile. Writes go through the
// `window.parla` bridge; a localStorage mirror keeps everything working when the
// bridge is unavailable (`electron-vite preview` in a plain browser) and, more
// importantly, gives us a second store to MERGE against so offline edits on
// either the phone or the Mac survive a sync (mirrors the mobile app's
// AsyncStorage mirror). The API is async throughout — mirroring the mobile app.

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
  known: number; // how often marked "known"
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

// Every language the learner has content in: both sides of the recently-used
// pairs (newest first), then the languages of saved words/phrases — the latter
// also covers content from builds that predate `recentPairs`. Used to surface
// "your" languages at the top of the input-language picker.
export function contentLanguages(
  pairs: LanguagePair[],
  ...itemLists: { lang: string }[][]
): string[] {
  const out: string[] = [];
  const add = (code: string) => {
    if (code && !out.includes(code)) out.push(code);
  };
  for (const p of pairs) {
    add(p.input);
    add(p.goal);
  }
  for (const list of itemLists) for (const item of list) add(item.lang);
  return out;
}

export type Settings = {
  anthropicKey: string; // kept for file compatibility with mobile — unused here
  openaiKey: string;
  inputLanguage: string; // what the learner speaks (Whisper transcription)
  goalLanguage: string; // the language being learned (Parla speaks/teaches)
  // Every goal language the learner works on. Grows automatically with whatever
  // is used and can be extended in Settings.
  learnLanguages: string[];
  showPinyin: boolean; // show Pinyin/Romaji line for Asian goal languages
  isPro: boolean; // Parla Pro — removes the free-tier rate limit
  uiLanguage: string; // app UI language: a UiLang code or 'auto' (device locale)
  defaultMode: 'free' | 'ask'; // which dialog mode starts active: 'free'=Interpreter, 'ask'=Coach
  theme: 'light' | 'dark' | 'system'; // color theme; 'system' follows the OS
  recentPairs: LanguagePair[]; // language pairs content was saved into, newest first
  // Emergency mode: shows a red button in the header that opens the emergency
  // screen (local-language phrases + location + two-way interpreter). Off by
  // default — it's opt-in via Settings.
  emergencyEnabled: boolean;
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

// ── Raw file IO (iCloud bridge + localStorage mirror) ──────────────────────────
// The mirror key the local copy lives under. Legacy `parla:<file>` (used by the
// old browser-preview fallback) is read once so nothing is lost on upgrade.
function mirrorKey(file: string): string {
  return `parla.mirror.${file}`;
}

// Read the iCloud copy (shared with the phone / other Macs), if the bridge is up.
async function readCloud(file: string): Promise<string | null> {
  if (!window.parla) return null;
  try {
    return await window.parla.read(file);
  } catch {
    return null;
  }
}

// Read the local copy: the mirror first, then the legacy browser-preview key.
async function readLocal(file: string): Promise<string | null> {
  try {
    const mirror = localStorage.getItem(mirrorKey(file));
    if (mirror != null) return mirror;
    return localStorage.getItem(`parla:${file}`);
  } catch {
    return null;
  }
}

// First non-empty of iCloud → mirror → legacy. Used for single-value files
// (settings, usage, quiz) where a record-level merge doesn't apply.
async function readRaw(file: string): Promise<string | null> {
  const cloud = await readCloud(file);
  if (cloud != null) return cloud;
  return readLocal(file);
}

// Persist to the local mirror always; push to iCloud best-effort (a failure just
// means the bridge is down / we're offline — the mirror still has the data and
// syncs on the next save).
async function writeRaw(file: string, content: string): Promise<void> {
  try {
    localStorage.setItem(mirrorKey(file), content);
  } catch {
    // ignore quota errors in the browser-preview fallback
  }
  if (window.parla) {
    try {
      await window.parla.write(file, content);
    } catch {
      // offline / iCloud unavailable — mirror holds it
    }
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

// ── Vocab ──────────────────────────────────────────────────────────────────────
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
  await writeRaw(VOCAB_FILE, JSON.stringify(items, null, 2));
}

// ── Phrases ──────────────────────────────────────────────────────────────────
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

// Add a goal language to the learn set (dedup, order preserved).
export function addLearnLanguage(list: string[], code: string): string[] {
  return list.includes(code) ? list : [...list, code];
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function loadSettings(): Promise<Settings> {
  const raw = await readRaw(SETTINGS_FILE);
  const stored: Partial<Settings> & { language?: string } = raw ? safeParse(raw) : {};
  // migrate the old single `language` field → goal language
  const goalLanguage = stored.goalLanguage || stored.language || 'zh';
  return {
    // The env key is the source of truth (no Settings UI to set it). Only fall
    // back to a previously-stored key if the env value is missing/placeholder.
    anthropicKey: stored.anthropicKey || '',
    openaiKey: !isPlaceholder(envOpenai) ? envOpenai : stored.openaiKey || '',
    inputLanguage: stored.inputLanguage || 'de',
    goalLanguage,
    learnLanguages: Array.isArray(stored.learnLanguages)
      ? addLearnLanguage(
          stored.learnLanguages.filter((c): c is string => typeof c === 'string' && !!c),
          goalLanguage
        )
      : [goalLanguage],
    showPinyin: stored.showPinyin ?? true,
    isPro: stored.isPro ?? false,
    uiLanguage: stored.uiLanguage || 'auto',
    defaultMode: stored.defaultMode === 'ask' ? 'ask' : 'free',
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
    recentPairs: sanitizePairs(stored.recentPairs),
    emergencyEnabled: stored.emergencyEnabled === true,
  };
}

// Older builds don't write `recentPairs` — accept anything shaped right and
// ignore the rest.
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

// ── Quiz preferences ────────────────────────────────────────────────────────
// How a quiz session picks its cards. Remembered per scope ('vocab' | 'phrases'
// | 'train') so starting the next session is a single tap.

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

// Dev runs (electron-vite dev, or VITE_ENV=dev) are exempt from the paywall.
// Only a packaged production build gates non-Pro users.
const IS_DEV_ENV =
  import.meta.env.DEV || (import.meta.env.VITE_ENV ?? '').toLowerCase() === 'dev';

export function isPaywallActive(isPro: boolean): boolean {
  return !IS_DEV_ENV && !isPro;
}

// Whether the shared iCloud store is active right now (for a Settings indicator).
// `linked` = the bridge is present (running in Electron, not a plain browser);
// `available` = the resolved data dir is the shared iCloud container, not the
// local userData fallback.
export async function iCloudStatus(): Promise<{ linked: boolean; available: boolean }> {
  if (!window.parla) return { linked: false, available: false };
  try {
    const info = await window.parla.info();
    return { linked: true, available: info.icloud === true };
  } catch {
    return { linked: true, available: false };
  }
}
