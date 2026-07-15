// Browser-local persistence, so the scaffold is usable before auth and the
// DynamoDB table exist. Same key names and JSON shapes the desktop client uses
// for its localStorage fallback (desktop/src/renderer/src/storage.ts).
//
// SCAFFOLD: this is a stopgap. Data here is per-browser — it does not sync with
// the iOS/desktop apps, which is the whole point of the DynamoDB table declared
// in sst.config.ts. Swap to storage.server.ts once auth lands (README q1).
import { DEFAULT_SETTINGS, type PhraseItem, type Settings, type VocabItem } from './types';

const VOCAB_KEY = 'parla:vocab.json';
const PHRASE_KEY = 'parla:phrases.json';
const SETTINGS_KEY = 'parla:settings.json';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback; // SSR pass
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function loadVocab(): VocabItem[] {
  return read<VocabItem[]>(VOCAB_KEY, []).map((v) => ({
    ...v,
    tags: Array.isArray(v.tags) ? v.tags : [],
  }));
}

export function saveVocab(items: VocabItem[]): void {
  write(VOCAB_KEY, items);
}

export function loadPhrases(): PhraseItem[] {
  return read<PhraseItem[]>(PHRASE_KEY, []).map((p) => ({
    ...p,
    tags: Array.isArray(p.tags) ? p.tags : [],
    reviews: p.reviews ?? 0,
    known: p.known ?? 0,
  }));
}

export function savePhrases(items: PhraseItem[]): void {
  write(PHRASE_KEY, items);
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

// Distinct tags ordered by most recent use. Ported from the other clients —
// powers tag suggestions and the quiz's tag filter.
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
