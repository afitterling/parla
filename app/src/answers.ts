// Comparing a typed answer to the expected one. Shared by the type quiz and the
// typing variant of the flashcard trainer.

// Fold away everything that shouldn't matter when comparing: tone marks /
// accents (via NFD + combining-mark strip), case, whitespace and punctuation.
// So "Gōng chē!" and "gongche" compare equal.
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s.,!?;:'’"·、。！？，…()\-—_/]/g, '');
}

// True when `input` matches any of the accepted spellings. For Chinese/Japanese
// both the characters and the romanization are accepted, so a learner without a
// Chinese keyboard can answer in pinyin.
export function answerMatches(input: string, accepted: (string | undefined)[]): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return accepted
    .filter((s): s is string => !!s && !!s.trim())
    .map(normalizeAnswer)
    .includes(got);
}
