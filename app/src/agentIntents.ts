// Applying what an agent asked for. Pure functions, so the rules are the same
// whichever device runs them and can be checked without a phone.
//
// Agents can only ADD. Nothing here edits or removes an existing word, and an
// entry already in the library (same language, same text, ignoring case) is
// skipped — the same duplicate check as adding by hand.
import { LANGUAGES } from './languages';
import type { PhraseItem, VocabItem } from './storage';

const MAX_TAGS = 10;

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const out = value.trim();
  return out ? out.slice(0, max) : undefined;
}

function items(args: Record<string, unknown>): Record<string, unknown>[] {
  const list = Array.isArray(args.items) ? args.items : null;
  if (!list) throw new Error('The request carries no items.');
  return list.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object');
}

function lang(value: unknown): string {
  const code = typeof value === 'string' ? value : '';
  if (!LANGUAGES.some((l) => l.code === code)) {
    throw new Error(`Parla has no language "${code}".`);
  }
  return code;
}

// The agent's own tags; when it gave none, its name, so the words can still be
// found ("Claude") in the tag filter.
function tags(value: unknown, source: string | undefined): string[] {
  const given = Array.isArray(value)
    ? value.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean)
    : [];
  const out: string[] = [];
  for (const t of given) if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  if (out.length === 0 && source) out.push(source.slice(0, 40));
  return out.slice(0, MAX_TAGS);
}

const key = (l: string, text: string) => `${l}:${text.trim().toLowerCase()}`;

/**
 * Ids are derived from the request id, not from the clock, so applying the
 * same request twice (React may run a state updater twice) yields the same
 * records — and the duplicate check then adds nothing the second time.
 */
export function applyVocabRequest(
  prev: VocabItem[],
  requestId: string,
  args: Record<string, unknown>,
  source: string | undefined,
  now: number
): { next: VocabItem[]; added: number; skipped: number } {
  const have = new Set(prev.map((v) => key(v.lang, v.term)));
  const fresh: VocabItem[] = [];
  let skipped = 0;
  items(args).forEach((item, index) => {
    const term = str(item.term, 200);
    const translation = str(item.translation, 500);
    if (!term || !translation) {
      skipped += 1;
      return;
    }
    const code = lang(item.lang);
    const k = key(code, term);
    if (have.has(k)) {
      skipped += 1;
      return;
    }
    have.add(k);
    fresh.push({
      id: `agent-${requestId}-${index}`,
      term,
      pinyin: str(item.pinyin, 300),
      translation,
      example: str(item.example, 1000),
      examplePinyin: str(item.examplePinyin, 1500),
      exampleTranslation: str(item.exampleTranslation, 1000),
      lang: code,
      tags: tags(item.tags, source),
      // Keeps the batch in the order the agent gave it in the newest-first list.
      createdAt: now - index,
      reviews: 0,
      known: 0,
    });
  });
  return { next: fresh.length ? [...fresh, ...prev] : prev, added: fresh.length, skipped };
}

export function applyPhraseRequest(
  prev: PhraseItem[],
  requestId: string,
  args: Record<string, unknown>,
  source: string | undefined,
  now: number
): { next: PhraseItem[]; added: number; skipped: number } {
  const have = new Set(prev.map((p) => key(p.lang, p.target)));
  const fresh: PhraseItem[] = [];
  let skipped = 0;
  items(args).forEach((item, index) => {
    const target = str(item.target, 1000);
    const translation = str(item.translation, 1000);
    if (!target || !translation) {
      skipped += 1;
      return;
    }
    const code = lang(item.lang);
    const k = key(code, target);
    if (have.has(k)) {
      skipped += 1;
      return;
    }
    have.add(k);
    fresh.push({
      id: `agent-${requestId}-${index}`,
      target,
      pinyin: str(item.pinyin, 1500),
      translation,
      lang: code,
      tags: tags(item.tags, source),
      createdAt: now - index,
      reviews: 0,
      known: 0,
    });
  });
  return { next: fresh.length ? [...fresh, ...prev] : prev, added: fresh.length, skipped };
}
