/**
 * The projection: Parla's library as the app last pushed it.
 *
 * Opaque to the store, read here. Everything an agent sees is derived from it,
 * so every field is treated as untrusted shape — an old build, or a push that
 * was cut short, must degrade to "less to show", never to an exception.
 */

export interface Word {
  id: string;
  term: string;
  /** Pinyin, romaji or another reading aid. Parla calls it `pinyin`. */
  reading?: string;
  translation: string;
  example?: string;
  exampleReading?: string;
  exampleTranslation?: string;
  lang: string;
  tags: string[];
  createdAt: number;
  reviews: number;
  known: number;
}

export interface Phrase {
  id: string;
  target: string;
  reading?: string;
  translation: string;
  lang: string;
  tags: string[];
  createdAt: number;
  reviews: number;
  known: number;
}

export interface ParlaProjection {
  /** The language the learner speaks — what translations are written in. */
  inputLanguage: string | null;
  /** The language currently being learned. */
  goalLanguage: string | null;
  learnLanguages: string[];
  /** Every language code the app can store, with its name. */
  supported: { code: string; name: string }[];
  vocab: Word[];
  phrases: Phrase[];
}

const text = (value: unknown, max = 2000): string =>
  typeof value === "string" ? value.slice(0, max) : "";
const optional = (value: unknown, max = 2000): string | undefined => {
  const out = text(value, max).trim();
  return out ? out : undefined;
};
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const tags = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((t): t is string => typeof t === "string" && !!t).slice(0, 50) : [];

/** Whatever was pushed, as something safe to read. */
export function normalise(payload: unknown): ParlaProjection {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const vocab = (Array.isArray(p.vocab) ? p.vocab : [])
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v): Word => ({
      id: text(v.id, 100),
      term: text(v.term),
      reading: optional(v.reading ?? v.pinyin),
      translation: text(v.translation),
      example: optional(v.example),
      exampleReading: optional(v.exampleReading ?? v.examplePinyin),
      exampleTranslation: optional(v.exampleTranslation),
      lang: text(v.lang, 20),
      tags: tags(v.tags),
      createdAt: count(v.createdAt),
      reviews: count(v.reviews),
      known: count(v.known),
    }))
    .filter((w) => w.term);
  const phrases = (Array.isArray(p.phrases) ? p.phrases : [])
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v): Phrase => ({
      id: text(v.id, 100),
      target: text(v.target),
      reading: optional(v.reading ?? v.pinyin),
      translation: text(v.translation),
      lang: text(v.lang, 20),
      tags: tags(v.tags),
      createdAt: count(v.createdAt),
      reviews: count(v.reviews),
      known: count(v.known),
    }))
    .filter((x) => x.target);
  const supported = (Array.isArray(p.supported) ? p.supported : [])
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof l.code === "string")
    .map((l) => ({ code: text(l.code, 20), name: text(l.name, 80) || text(l.code, 20) }));
  return {
    inputLanguage: optional(p.inputLanguage, 20) ?? null,
    goalLanguage: optional(p.goalLanguage, 20) ?? null,
    learnLanguages: tags(p.learnLanguages),
    supported,
    vocab,
    phrases,
  };
}

/** Case, accents and surrounding space do not make a word a different word. */
export function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

/** The key Parla's own duplicate check uses: same language, same term. */
export function wordKey(lang: string, term: string): string {
  return `${lang}:${fold(term)}`;
}

export function languageName(projection: ParlaProjection, code: string | null | undefined): string {
  if (!code) return "—";
  const known = projection.supported.find((l) => l.code === code);
  return known && known.name !== code ? `${known.name} (${code})` : code;
}

// --- Overview --------------------------------------------------------------

export interface LanguageSummary {
  lang: string;
  name: string;
  words: number;
  learnedWords: number;
  phrases: number;
  tags: { tag: string; count: number }[];
}

export function overview(projection: ParlaProjection): LanguageSummary[] {
  const byLang = new Map<string, { words: Word[]; phrases: Phrase[] }>();
  const bucket = (lang: string) => {
    let entry = byLang.get(lang);
    if (!entry) byLang.set(lang, (entry = { words: [], phrases: [] }));
    return entry;
  };
  for (const w of projection.vocab) bucket(w.lang).words.push(w);
  for (const p of projection.phrases) bucket(p.lang).phrases.push(p);
  for (const lang of projection.learnLanguages) bucket(lang);

  return [...byLang.entries()]
    .map(([lang, { words, phrases }]) => {
      const tagCounts = new Map<string, number>();
      for (const item of [...words, ...phrases]) {
        for (const tag of item.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
      return {
        lang,
        name: languageName(projection, lang),
        words: words.length,
        learnedWords: words.filter((w) => w.known > 0).length,
        phrases: phrases.length,
        tags: [...tagCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 25)
          .map(([tag, n]) => ({ tag, count: n })),
      };
    })
    .sort((a, b) => b.words + b.phrases - (a.words + a.phrases));
}

export function renderOverview(projection: ParlaProjection): string {
  const languages = overview(projection);
  const lines = [
    `Speaks: ${languageName(projection, projection.inputLanguage)}. ` +
      `Currently learning: ${languageName(projection, projection.goalLanguage)}.`,
  ];
  if (languages.length === 0) {
    lines.push("The library is empty.");
    return lines.join("\n");
  }
  for (const l of languages) {
    const tagList = l.tags.slice(0, 10).map((t) => `${t.tag} (${t.count})`).join(", ");
    lines.push(
      `- ${l.name}: ${plural(l.words, "word")} (${l.learnedWords} learned), ${plural(l.phrases, "phrase")}` +
        (tagList ? `. Tags: ${tagList}` : ""),
    );
  }
  return lines.join("\n");
}

// --- Search ----------------------------------------------------------------

export interface Filter {
  lang?: string;
  tag?: string;
  query?: string;
  learned?: boolean;
  limit: number;
  offset: number;
}

function matches(item: { lang: string; tags: string[]; known: number }, haystack: string[], filter: Filter): boolean {
  if (filter.lang && item.lang !== filter.lang) return false;
  if (filter.tag && !item.tags.some((t) => fold(t) === fold(filter.tag!))) return false;
  if (filter.learned !== undefined && item.known > 0 !== filter.learned) return false;
  if (filter.query) {
    const needle = fold(filter.query);
    if (!haystack.some((h) => fold(h).includes(needle))) return false;
  }
  return true;
}

/** Newest first, the order the Vocab tab shows. */
export function searchWords(projection: ParlaProjection, filter: Filter): { total: number; words: Word[] } {
  const hits = projection.vocab
    .filter((w) => matches(w, [w.term, w.translation, w.reading ?? "", w.example ?? ""], filter))
    .sort((a, b) => b.createdAt - a.createdAt);
  return { total: hits.length, words: hits.slice(filter.offset, filter.offset + filter.limit) };
}

export function searchPhrases(projection: ParlaProjection, filter: Filter): { total: number; phrases: Phrase[] } {
  const hits = projection.phrases
    .filter((p) => matches(p, [p.target, p.translation, p.reading ?? ""], filter))
    .sort((a, b) => b.createdAt - a.createdAt);
  return { total: hits.length, phrases: hits.slice(filter.offset, filter.offset + filter.limit) };
}

export function renderWords(found: { total: number; words: Word[] }, filter: Filter): string {
  if (found.total === 0) return "No words match.";
  const lines = found.words.map((w) => {
    const reading = w.reading ? ` [${w.reading}]` : "";
    const tagList = w.tags.length ? ` #${w.tags.join(" #")}` : "";
    const learned = w.known > 0 ? " ✓" : "";
    return `- ${w.term}${reading} — ${w.translation} (${w.lang})${learned}${tagList}`;
  });
  return [range(found.total, found.words.length, filter, "word"), ...lines].join("\n");
}

export function renderPhrases(found: { total: number; phrases: Phrase[] }, filter: Filter): string {
  if (found.total === 0) return "No phrases match.";
  const lines = found.phrases.map((p) => {
    const reading = p.reading ? ` [${p.reading}]` : "";
    const tagList = p.tags.length ? ` #${p.tags.join(" #")}` : "";
    return `- ${p.target}${reading} — ${p.translation} (${p.lang})${tagList}`;
  });
  return [range(found.total, found.phrases.length, filter, "phrase"), ...lines].join("\n");
}

function range(total: number, shown: number, filter: Filter, noun: string): string {
  if (shown === total) return `${plural(total, noun)}:`;
  return `${plural(total, noun)}; showing ${filter.offset + 1}–${filter.offset + shown} (pass offset to see more):`;
}

export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** A sentence about how old the projection is, when that matters. */
export function freshness(asOf: string | null, now: number): string {
  if (!asOf) return "Parla has not pushed its library yet: open the app once while signed in.";
  const age = now - Date.parse(asOf);
  if (!(age >= 60 * 60 * 1000)) return "";
  const hours = Math.round(age / (60 * 60 * 1000));
  return hours < 48
    ? `(Parla last pushed its library ${plural(hours, "hour")} ago.)`
    : `(Parla last pushed its library ${plural(Math.round(hours / 24), "day")} ago.)`;
}
