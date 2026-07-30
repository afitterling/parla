import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Flame, X, XCircle } from 'lucide-react';
import { SpeakButton } from './SpeakButton';
import { answerMatches } from '../answers';
import { useT } from '../i18n/I18nContext';

// Drill ONE word or phrase, over and over. The quiz and the flashcard trainer
// both walk a queue and end; this is the opposite — a single item repeated until
// you close it, with a streak to play against. Opened from the "Learn" action on
// a vocabulary or phrase row.
export type LearnItem = {
  id: string;
  term: string; // the word/phrase in the goal language (characters)
  pinyin?: string; // its romanization — Pinyin/Romaji — where the language has one
  translation: string; // its meaning in the learner's language
};

// Which side you produce; the remaining side becomes the prompt. 'term' is asked
// from the meaning, the other two from the characters.
export type LearnSide = 'term' | 'reading' | 'meaning';

type Props = {
  item: LearnItem;
  goalLangName: string; // e.g. 中文 — labels the characters side
  nativeLangName: string; // e.g. Deutsch — labels the meaning side
  romanized: boolean; // goal language has a reading at all
  locale: string; // speech locale for the answer's speak button
  /** Persist a review, exactly like a quiz answer does. */
  onResult?: (correct: boolean) => void;
  onClose: () => void;
};

// A side can only be drilled when both its prompt and its answer exist.
function availableSides(item: LearnItem, romanized: boolean): LearnSide[] {
  const sides: LearnSide[] = [];
  const term = !!item.term.trim();
  const translation = !!item.translation.trim();
  const pinyin = !!item.pinyin?.trim();
  if (term && translation) sides.push('term');
  if (term && romanized && pinyin) sides.push('reading');
  if (term && translation) sides.push('meaning');
  return sides;
}

export function LearnDrill({
  item,
  goalLangName,
  nativeLangName,
  romanized,
  locale,
  onResult,
  onClose,
}: Props) {
  const t = useT();
  const sides = availableSides(item, romanized);
  const [side, setSide] = useState<LearnSide>(sides[0] ?? 'term');
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState({ right: 0, rounds: 0 });
  // Bumped every round so the input remounts and re-focuses on the next repeat.
  const [round, setRound] = useState(0);

  // The item can change under us (its pinyin gets backfilled, say) — start over
  // rather than grading the new item against the old streak.
  useEffect(() => {
    setSide(availableSides(item, romanized)[0] ?? 'term');
    setInput('');
    setChecked(false);
    setStreak(0);
    setScore({ right: 0, rounds: 0 });
  }, [item.id]);

  if (sides.length === 0) {
    return (
      <div className="learn-root">
        <div className="learn-top">
          <button className="wordcard-icon" onClick={onClose} aria-label={t('common.done')}>
            <X size={22} />
          </button>
          <div className="learn-title">{t('learn.title')}</div>
        </div>
        <div className="train-center">
          <p className="no-match">{t('quiz.empty')}</p>
        </div>
      </div>
    );
  }

  // What's shown, what's accepted, and what the input is asking for. Characters
  // may be answered in romanization too, so no Chinese keyboard is needed.
  const face =
    side === 'term'
      ? {
          prompt: item.translation,
          promptLabel: nativeLangName,
          accepted: [item.term, item.pinyin],
          hint: t('quiz.typeAnswer', { lang: goalLangName }),
        }
      : side === 'reading'
        ? {
            prompt: item.term,
            promptLabel: goalLangName,
            accepted: [item.pinyin],
            hint: t('quiz.typePinyin'),
          }
        : {
            prompt: item.term,
            promptLabel: goalLangName,
            accepted: [item.translation],
            hint: t('train.typeMeaning'),
          };

  const sideLabel: Record<LearnSide, string> = {
    term: goalLangName,
    reading: t('learn.reading'),
    meaning: nativeLangName,
  };

  function chooseSide(next: LearnSide) {
    if (next === side) return;
    // A different exercise — the streak doesn't carry over.
    setSide(next);
    setInput('');
    setChecked(false);
    setStreak(0);
    setRound((r) => r + 1);
  }

  function check() {
    if (checked) return;
    const ok = answerMatches(input, face.accepted);
    setLastCorrect(ok);
    setChecked(true);
    setStreak((s) => (ok ? s + 1 : 0));
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), rounds: s.rounds + 1 }));
    onResult?.(ok);
  }

  // Give up on this repeat: show the answer, scored as wrong.
  function reveal() {
    if (checked) return;
    setLastCorrect(false);
    setChecked(true);
    setStreak(0);
    setScore((s) => ({ ...s, rounds: s.rounds + 1 }));
    onResult?.(false);
  }

  // Same item again — that's the whole point of the drill.
  function again() {
    setInput('');
    setChecked(false);
    setRound((r) => r + 1);
  }

  return (
    <div className="learn-root">
      <div className="learn-top">
        <button className="wordcard-icon" onClick={onClose} aria-label={t('common.done')}>
          <X size={22} />
        </button>
        <div className="learn-title">{t('learn.title')}</div>
        {score.rounds > 0 && (
          <span className="learn-score">
            {score.right}/{score.rounds}
          </span>
        )}
        <span className={`learn-streak${streak === 0 ? ' cold' : ''}`} title={t('learn.streak')}>
          <Flame size={15} />
          {streak}
        </span>
      </div>

      {sides.length > 1 && (
        <>
          <div className="train-hint">{t('learn.side')}</div>
          <div className="quiz-setup-row">
            {sides.map((s) => (
              <button
                key={s}
                className={`filter-chip${side === s ? ' on' : ''}`}
                onClick={() => chooseSide(s)}
              >
                {sideLabel[s]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="quiz-scroll">
        <div className="quiz-card">
          <div className="side">{face.promptLabel}</div>
          <div className="quiz-prompt">{face.prompt}</div>

          <div className="quiz-hint">{face.hint}</div>
          <div className="type-row">
            <input
              key={round}
              className={`quiz-input${checked ? (lastCorrect ? ' correct' : ' wrong') : ''}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (checked ? again() : check())}
              disabled={checked}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={side === 'reading' ? 'pinyin …' : '…'}
            />
            {!checked && (
              <button
                className="type-submit"
                disabled={!input.trim()}
                onClick={check}
                aria-label={t('quiz.check')}
                title={t('quiz.check')}
              >
                <ArrowRight size={20} />
              </button>
            )}
          </div>

          {checked && (
            <div className="quiz-result">
              <div className={`quiz-verdict${lastCorrect ? ' ok' : ' bad'}`}>
                {lastCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {lastCorrect ? t('quiz.correct') : t('quiz.wrong')}
              </div>
              {/* The whole card on every reveal — word, reading, meaning — so the
                  repeat is also an exposure to the sides you weren't asked for. */}
              <div className="quiz-answer-row">
                <div className="quiz-answer-main">
                  <div className="quiz-answer">{item.term}</div>
                  {!!item.pinyin && <div className="quiz-answer-pinyin">{item.pinyin}</div>}
                  {!!item.translation && <div className="quiz-answer-trans">{item.translation}</div>}
                </div>
                <SpeakButton text={item.term} locale={locale} />
              </div>
            </div>
          )}
        </div>
      </div>

      {checked ? (
        <button className="reveal-btn" onClick={again}>
          {t('learn.repeat')}
        </button>
      ) : (
        <div className="answer-row">
          <button className="answer-btn again" onClick={reveal}>
            {t('quiz.showAnswer')}
          </button>
        </div>
      )}
    </div>
  );
}
