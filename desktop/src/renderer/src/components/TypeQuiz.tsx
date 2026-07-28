import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Trophy, CheckCircle2, XCircle, X } from 'lucide-react';
import { SpeakButton } from './SpeakButton';
import { answerMatches } from '../answers';
import { useT } from '../i18n/I18nContext';
import {
  QuizScope,
  QuizPrefs,
  DEFAULT_QUIZ_PREFS,
  QUIZ_COUNTS,
  loadQuizPrefs,
  saveQuizPrefs,
} from '../storage';

// One thing to be quizzed. `prompt` is shown (usually the native-language
// meaning); the learner types `answer` — or, for romanized goal languages, its
// `pinyin`. Both are accepted so a user with a Chinese keyboard can type either.
export type QuizItem = {
  id: string;
  prompt: string; // shown as the question (the meaning)
  answer: string; // the target word/phrase (characters)
  pinyin?: string; // romanization — the expected typed answer for romanized langs
  tags: string[];
  lang: string;
  known?: number; // >0 = already answered correctly before (for skip-learned)
};

type Props = {
  items: QuizItem[];
  romanized: boolean; // goal language uses pinyin/romaji → user types the romanization
  answerLangName: string; // goal language name, for the "type in X" hint
  locale: string; // speech locale for the reveal's speak button
  tagSuggestions: string[];
  scope: QuizScope; // which stored preference set to remember (vocab | phrases | train)
  onResult?: (id: string, correct: boolean) => void; // persist a review
};

function isCorrect(input: string, item: QuizItem): boolean {
  return answerMatches(input, [item.pinyin, item.answer]);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function TypeQuiz({
  items,
  romanized,
  answerLangName,
  locale,
  tagSuggestions,
  scope,
  onResult,
}: Props) {
  const t = useT();

  const [sessionTag, setSessionTag] = useState<string | null>(null);
  const [count, setCount] = useState<number>(DEFAULT_QUIZ_PREFS.count);
  const [skipLearned, setSkipLearned] = useState<boolean>(DEFAULT_QUIZ_PREFS.skipLearned);
  const [queue, setQueue] = useState<QuizItem[] | null>(null); // null = setup
  const [total, setTotal] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);

  // Restore the last session's preferences for this scope (persisted in quiz.json,
  // shared across devices via the same store).
  useEffect(() => {
    let alive = true;
    loadQuizPrefs(scope).then((p) => {
      if (!alive) return;
      setSessionTag(p.tags[0] ?? null);
      setCount(p.count);
      setSkipLearned(p.skipLearned);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  function persist(next: Partial<QuizPrefs>) {
    const prefs: QuizPrefs = {
      ...DEFAULT_QUIZ_PREFS,
      tags: sessionTag ? [sessionTag] : [],
      count,
      skipLearned,
      ...next,
    };
    void saveQuizPrefs(scope, prefs);
  }

  const pool = useMemo(
    () =>
      items.filter((it) => {
        if (sessionTag && !it.tags.some((tag) => tag.toLowerCase() === sessionTag.toLowerCase()))
          return false;
        if (skipLearned && (it.known ?? 0) > 0) return false;
        return true;
      }),
    [items, sessionTag, skipLearned]
  );

  function start() {
    let q = shuffle(pool);
    if (count > 0) q = q.slice(0, count);
    setQueue(q);
    setTotal(q.length);
    setScore(0);
    setInput('');
    setChecked(false);
    persist({});
  }

  function reset() {
    setQueue(null);
    setInput('');
    setChecked(false);
  }

  const current = queue && queue.length > 0 ? queue[0] : null;

  function check() {
    if (!current || checked) return;
    const ok = isCorrect(input, current);
    setLastCorrect(ok);
    setChecked(true);
    if (ok) setScore((s) => s + 1);
    onResult?.(current.id, ok);
  }

  function reveal() {
    // Give up on this card → show the answer, scored as wrong.
    if (!current || checked) return;
    setLastCorrect(false);
    setChecked(true);
    onResult?.(current.id, false);
  }

  function next() {
    setQueue((q) => (q ? q.slice(1) : q));
    setInput('');
    setChecked(false);
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (queue === null) {
    if (items.length === 0) {
      return (
        <div className="train-center">
          <PencilLine size={52} className="faint" />
          <p className="no-match">{t('quiz.empty')}</p>
        </div>
      );
    }
    return (
      <div className="flex-col">
        <div className="train-hint">{t('quiz.whichItems')}</div>
        <TagFilterRow
          tags={tagSuggestions}
          value={sessionTag}
          onChange={(v) => {
            setSessionTag(v);
            persist({ tags: v ? [v] : [] });
          }}
        />
        <div className="quiz-setup-row">
          {QUIZ_COUNTS.map((c) => (
            <button
              key={c}
              className={`filter-chip${count === c ? ' on' : ''}`}
              onClick={() => {
                setCount(c);
                persist({ count: c });
              }}
            >
              {c === 0 ? t('quiz.countAll') : c}
            </button>
          ))}
        </div>
        <label className="quiz-skip">
          <input
            type="checkbox"
            checked={skipLearned}
            onChange={(e) => {
              setSkipLearned(e.target.checked);
              persist({ skipLearned: e.target.checked });
            }}
          />
          {t('quiz.skipLearned')}
        </label>
        <div className="train-center">
          <div className="pool-count">{t('quiz.poolCount', { count: pool.length })}</div>
          <button className="big-btn" disabled={pool.length === 0} onClick={start}>
            {t('quiz.start')}
          </button>
        </div>
      </div>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (!current) {
    return (
      <div className="train-center">
        <Trophy size={52} className="ink" />
        <h2 className="done-title">{t('quiz.doneTitle', { score, total })}</h2>
        <button className="big-btn" onClick={start}>
          {t('quiz.again')}
        </button>
        <button className="link-plain" onClick={reset}>
          {t('train.changeSettings')}
        </button>
      </div>
    );
  }

  const done = total - queue.length;

  return (
    <div className="flex-col">
      <div className="progress">
        <span className="score">
          {score}/{total}
        </span>
        <span className="num center">
          {done + 1}/{total}
        </span>
        <button className="icon-plain" onClick={reset} aria-label={t('common.done')}>
          <X size={20} />
        </button>
      </div>

      <div className="quiz-scroll">
        <div className="quiz-card">
          <div className="side">{t('quiz.meaning')}</div>
          <div className="quiz-prompt">{current.prompt}</div>
          <div className="quiz-hint">
            {romanized ? t('quiz.typePinyin') : t('quiz.typeAnswer', { lang: answerLangName })}
          </div>

          <input
            className={`quiz-input${checked ? (lastCorrect ? ' correct' : ' wrong') : ''}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (checked ? next() : check())}
            disabled={checked}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={romanized ? 'pinyin …' : '…'}
          />

          {checked && (
            <div className="quiz-result">
              <div className={`quiz-verdict${lastCorrect ? ' ok' : ' bad'}`}>
                {lastCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {lastCorrect ? t('quiz.correct') : t('quiz.wrong')}
              </div>
              <div className="quiz-answer-row">
                <div className="quiz-answer-main">
                  <div className="quiz-answer">{current.answer}</div>
                  {!!current.pinyin && <div className="quiz-answer-pinyin">{current.pinyin}</div>}
                </div>
                <SpeakButton text={current.answer} locale={locale} />
              </div>
            </div>
          )}
        </div>
      </div>

      {checked ? (
        <button className="reveal-btn" onClick={next}>
          {t('quiz.next')}
        </button>
      ) : (
        <div className="answer-row">
          <button className="answer-btn again" onClick={reveal}>
            {t('quiz.showAnswer')}
          </button>
          <button className="answer-btn check" disabled={!input.trim()} onClick={check}>
            {t('quiz.check')}
          </button>
        </div>
      )}
    </div>
  );
}

function TagFilterRow({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  if (tags.length === 0) return null;
  return (
    <div className="toggle-row">
      <button className={`filter-chip${value === null ? ' on' : ''}`} onClick={() => onChange(null)}>
        {t('common.all')}
      </button>
      {tags.map((tag) => {
        const on = value?.toLowerCase() === tag.toLowerCase();
        return (
          <button
            key={tag}
            className={`filter-chip${on ? ' on' : ''}`}
            onClick={() => onChange(on ? null : tag)}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
