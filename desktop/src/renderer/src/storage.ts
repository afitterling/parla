// localStorage-backed persistence (synchronous), mirroring the mobile app.

export type VocabItem = {
  id: string;
  term: string;
  translation: string;
  example?: string;
  lang: string;
  createdAt: number;
};

export type PhraseItem = {
  id: string;
  target: string;
  pinyin?: string;
  translation: string;
  lang: string;
  tags: string[];
  createdAt: number;
  reviews: number;
  known: number;
};

export type Settings = {
  openaiKey: string;
  inputLanguage: string;
  goalLanguage: string;
  showPinyin: boolean;
};

const VOCAB_KEY = 'parla.vocab';
const PHRASE_KEY = 'parla.phrases';
const SETTINGS_KEY = 'parla.settings';

const envOpenai = (import.meta.env.VITE_OPENAI_API_KEY ?? '').trim();

function isPlaceholder(key: string): boolean {
  return !key || key.includes('REPLACE_ME') || key.endsWith('...');
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadVocab(): VocabItem[] {
  return read<VocabItem[]>(VOCAB_KEY, []);
}
export function saveVocab(items: VocabItem[]): void {
  localStorage.setItem(VOCAB_KEY, JSON.stringify(items));
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
  localStorage.setItem(PHRASE_KEY, JSON.stringify(items));
}

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

export function loadSettings(): Settings {
  const stored = read<Partial<Settings> & { language?: string }>(SETTINGS_KEY, {});
  return {
    openaiKey: stored.openaiKey || (isPlaceholder(envOpenai) ? '' : envOpenai),
    inputLanguage: stored.inputLanguage || 'de',
    goalLanguage: stored.goalLanguage || stored.language || 'zh',
    showPinyin: stored.showPinyin ?? true,
  };
}
export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
