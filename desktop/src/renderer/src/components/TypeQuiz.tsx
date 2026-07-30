import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Trophy, CheckCircle2, XCircle, X, ArrowRight, RefreshCw, Check } from 'lucide-react';
import { SpeakButton } from './SpeakButton';
import { answerMatches } from '../answers';
import { useT } from '../i18n/I18nContext';
import {
  DEFAULT_QUIZ_PREFS,
  QUIZ_COUNTS,
  QUIZ_RECENT_DAYS,
  QuizDirection,
  QuizPrefs,
  QuizScope,
  QuizSource,
  loadQuizPrefs,
  saveQuizPrefs,
} from '../storage';

// One thing to be quizzed. Which of the three sides is the question and which
// is the answer depends on the session's direction (see QuizDirection).
export type QuizItem = {
  id: string;
  term: string; // the word/phrase in the goal language (characters)
  translation: string; // its meaning in the learner's language
  pinyin?: string; // romanization — Pinyin/Romaji
  tags: string[];
  lang: string;
  createdAt: number; // when it was saved — drives the "last N days" selection
  known: number; // times answered correctly; >0 means "already learned"
};

// The question side, the accepted answers, and what the input is asking for.
// 'toWord' takes the characters *or* the romanization, so a learner without a
// Chinese keyboard is never stuck.
function faces(item: QuizItem, direction: QuizDirection) {
  if (direction === 'toReading') {
    return { prompt: item.term, accepted: [item.pinyin], askReading: true };
  }
  if (direction === 'toMeaning') {
    return { prompt: item.term, accepted: [item.translation], askReading: false };
  }
  return { prompt: item.translation, accepted: [item.term, item.pinyin], askReading: true };
}

// An item can only be asked in a direction it actually has an answer for.
function answerable(item: QuizItem, direction: QuizDirection): boolean {
  if (direction === 'toReading') return !!item.pinyin?.trim();
  if (direction === 'toMeaning') return !!item.translation.trim();
  return !!item.term.trim();
}

type Props = {
  items: QuizItem[];
  romanized: boolean; // goal language uses pinyin/romaji → user types the romanization
  answerLangName: string; // goal language name, for the "type in X" hint
  locale: string; // speech locale for the reveal's speak button
  tagSuggestions: string[];
  scope: QuizScope; // which collection — quiz preferences are remembered per scope
  onResult?: (id: string, correct: boolean) => void; // persist a review
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY_MS = 86_400_000;

// Round-robin across tags, so a "mix" session touches every topic instead of
// marching through one. Untagged items form a bucket of their own.
function mixByTag(items: QuizItem[]): QuizItem[] {
  const buckets = new Map<string, QuizItem[]>();
  for (const it of shuffle(items)) {
    const key = (it.tags[0] ?? '').toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) bucket.push(it);
    else buckets.set(key, [it]);
  }
  const lists = [...buckets.values()];
  const deepest = Math.max(0, ...lists.map((l) => l.length));
  const out: QuizItem[] = [];
  for (let i = 0; i < deepest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

// Everything the current preferences allow into a session, before shuffling and
// before the card-count cap.
function selectPool(items: QuizItem[], prefs: QuizPrefs, now: number): QuizItem[] {
  const askable = items.filter((it) => answerable(it, prefs.direction));
  const pool = prefs.skipLearned ? askable.filter((it) => !it.known) : askable;
  if (prefs.source === 'recent') {
    return pool.filter((it) => now - it.createdAt <= QUIZ_RECENT_DAYS * DAY_MS);
  }
  if (prefs.source === 'tags' && prefs.tags.length > 0) {
    const wanted = prefs.tags.map((t) => t.toLowerCase());
    return pool.filter((it) => it.tags.some((t) => wanted.includes(t.toLowerCase())));
  }
  return pool; // 'random', 'mix', or 'tags' with nothing picked yet
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

  const [prefs, setPrefs] = useState<QuizPrefs>(DEFAULT_QUIZ_PREFS);
  const [queue, setQueue] = useState<QuizItem[] | null>(null); // null = setup
  const [total, setTotal] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);

  // Restore the last session's selection; every change is written straight back
  // (quiz.json, shared across devices via the same store).
  useEffect(() => {
    let alive = true;
    loadQuizPrefs(scope).then((p) => {
      if (alive) setPrefs(p);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  function updatePrefs(patch: Partial<QuizPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void saveQuizPrefs(scope, next);
      return next;
    });
  }

  // Recomputed on every render of the setup screen so the count stays honest as
  // options are toggled. Date.now() is only read while setting up.
  const pool = useMemo(() => selectPool(items, prefs, Date.now()), [items, prefs]);
  const learnedCount = items.filter((it) => it.known > 0).length;
  const typing = prefs.answerMode === 'type';
  const sessionSize = prefs.count > 0 ? Math.min(prefs.count, pool.length) : pool.length;

  function start() {
    const ordered = prefs.source === 'mix' ? mixByTag(pool) : shuffle(pool);
    const q = prefs.count > 0 ? ordered.slice(0, prefs.count) : ordered;
    setQueue(q);
    setTotal(q.length);
    setScore(0);
    setInput('');
    setChecked(false);
  }

  function reset() {
    setQueue(null);
    setInput('');
    setChecked(false);
  }

  const current = queue && queue.length > 0 ? queue[0] : null;

  function check() {
    if (!current || checked) return;
    const ok = answerMatches(input, faces(current, prefs.direction).accepted);
    setLastCorrect(ok);
    setChecked(true);
    if (ok) setScore((s) => s + 1);
    onResult?.(current.id, ok);
  }

  function reveal() {
    // Typing mode: give up on this card → show the answer, scored as wrong.
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

  // ── Flashcard grading (reveal mode) ────────────────────────────────────────
  // "Knew it" retires the card; "Again" sends it to the back of the queue, so a
  // session ends only once every card has been known at least once.
  function gradeKnown() {
    if (!current) return;
    onResult?.(current.id, true);
    setScore((s) => s + 1);
    next();
  }

  function gradeAgain() {
    if (!current) return;
    onResult?.(current.id, false);
    setQueue((q) => (q ? [...q.slice(1), q[0]] : q));
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
    // "Type the reading" only makes sense where there is a romanization.
    const directions: { key: QuizDirection; label: string }[] = [
      { key: 'toWord', label: t('quiz.dirToWord') },
      ...(romanized ? [{ key: 'toReading' as const, label: t('quiz.dirToReading') }] : []),
      { key: 'toMeaning', label: t('quiz.dirToMeaning') },
    ];
    const sources: { key: QuizSource; label: string }[] = [
      { key: 'recent', label: t('quiz.srcRecent', { days: QUIZ_RECENT_DAYS }) },
      { key: 'mix', label: t('quiz.srcMix') },
      { key: 'tags', label: t('quiz.srcTags') },
      { key: 'random', label: t('quiz.srcRandom') },
    ];
    return (
      <div className="flex-col">
        <div className="quiz-setup">
          <div className="train-hint">{t('quiz.direction')}</div>
          <div className="quiz-setup-row">
            {directions.map((d) => (
              <button
                key={d.key}
                className={`filter-chip${prefs.direction === d.key ? ' on' : ''}`}
                onClick={() => updatePrefs({ direction: d.key })}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="train-hint">{t('train.answerMode')}</div>
          <div className="quiz-setup-row">
            <button
              className={`filter-chip${prefs.answerMode === 'reveal' ? ' on' : ''}`}
              onClick={() => updatePrefs({ answerMode: 'reveal' })}
            >
              {t('train.modeReveal')}
            </button>
            <button
              className={`filter-chip${prefs.answerMode === 'type' ? ' on' : ''}`}
              onClick={() => updatePrefs({ answerMode: 'type' })}
            >
              {t('train.modeType')}
            </button>
          </div>

          <div className="train-hint">{t('quiz.whichItems')}</div>
          <div className="quiz-setup-row">
            {sources.map((s) => (
              <button
                key={s.key}
                className={`filter-chip${prefs.source === s.key ? ' on' : ''}`}
                onClick={() => updatePrefs({ source: s.key })}
              >
                {s.label}
              </button>
            ))}
          </div>

          {prefs.source === 'tags' && (
            <>
              <div className="train-hint">{t('quiz.pickTags')}</div>
              {tagSuggestions.length === 0 ? (
                <p className="no-match">{t('quiz.noTags')}</p>
              ) : (
                <div className="quiz-setup-row">
                  {tagSuggestions.map((tag) => {
                    const on = prefs.tags.some((s) => s.toLowerCase() === tag.toLowerCase());
                    return (
                      <button
                        key={tag}
                        className={`filter-chip${on ? ' on' : ''}`}
                        onClick={() =>
                          updatePrefs({
                            tags: on
                              ? prefs.tags.filter((s) => s.toLowerCase() !== tag.toLowerCase())
                              : [...prefs.tags, tag],
                          })
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="train-hint">{t('quiz.howMany')}</div>
          <div className="quiz-setup-row">
            {QUIZ_COUNTS.map((n) => (
              <button
                key={n}
                className={`filter-chip${prefs.count === n ? ' on' : ''}`}
                onClick={() => updatePrefs({ count: n })}
              >
                {n === 0 ? t('common.all') : n}
              </button>
            ))}
          </div>

          <label className="quiz-skip">
            <input
              type="checkbox"
              checked={prefs.skipLearned}
              onChange={(e) => updatePrefs({ skipLearned: e.target.checked })}
            />
            <span className="quiz-skip-main">
              {t('quiz.skipLearned')}
              <span className="quiz-skip-sub">{t('quiz.learnedCount', { count: learnedCount })}</span>
            </span>
          </label>
        </div>

        <div className="quiz-start-bar">
          <span className="pool-count">{t('quiz.poolCount', { count: sessionSize })}</span>
          <button className="big-btn" disabled={sessionSize === 0} onClick={start}>
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
        <h2 className="done-title">
          {typing ? t('quiz.doneTitle', { score, total }) : t('train.doneTitle', { total })}
        </h2>
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
  const face = faces(current, prefs.direction);

  return (
    <div className="flex-col">
      <div className="progress">
        {/* A flashcard session only ends once every card was "knew it", so a
            score would always read N/N — show progress alone. */}
        {typing && (
          <span className="score">
            {score}/{total}
          </span>
        )}
        <span className="num center">
          {done + 1}/{total}
        </span>
        <button className="icon-plain" onClick={reset} aria-label={t('common.done')}>
          <X size={20} />
        </button>
      </div>

      <div className="quiz-scroll">
        <div
          className={`quiz-card${!typing && !checked ? ' tappable' : ''}`}
          onClick={() => !typing && !checked && setChecked(true)}
        >
          <div className="side">
            {prefs.direction === 'toWord' ? t('quiz.meaning') : t('quiz.wordSide')}
          </div>
          <div className="quiz-prompt">{face.prompt}</div>

          {!typing && !checked && <div className="quiz-hint">{t('train.tapToReveal')}</div>}

          {typing && (
            <>
              <div className="quiz-hint">
                {!face.askReading
                  ? t('train.typeMeaning')
                  : romanized
                    ? t('quiz.typePinyin')
                    : t('quiz.typeAnswer', { lang: answerLangName })}
              </div>
              <div className="type-row">
                <input
                  // Remount per card so autoFocus fires again on the next one.
                  key={current.id}
                  className={`quiz-input${checked ? (lastCorrect ? ' correct' : ' wrong') : ''}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (checked ? next() : check())}
                  disabled={checked}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={face.askReading && romanized ? 'pinyin …' : '…'}
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
            </>
          )}

          {checked && (
            <div className="quiz-result">
              {typing && (
                <div className={`quiz-verdict${lastCorrect ? ' ok' : ' bad'}`}>
                  {lastCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  {lastCorrect ? t('quiz.correct') : t('quiz.wrong')}
                </div>
              )}
              {/* Always show the full card on reveal — word, reading, meaning —
                  whichever side was asked for. */}
              <div className="quiz-answer-row">
                <div className="quiz-answer-main">
                  <div className="quiz-answer">{current.term}</div>
                  {!!current.pinyin && <div className="quiz-answer-pinyin">{current.pinyin}</div>}
                  {prefs.direction !== 'toWord' && !!current.translation && (
                    <div className="quiz-answer-trans">{current.translation}</div>
                  )}
                </div>
                <SpeakButton text={current.term} locale={locale} />
              </div>
            </div>
          )}
        </div>
      </div>

      {typing ? (
        checked ? (
          <button className="reveal-btn" onClick={next}>
            {t('quiz.next')}
          </button>
        ) : (
          <div className="answer-row">
            <button className="answer-btn again" onClick={reveal}>
              {t('quiz.showAnswer')}
            </button>
          </div>
        )
      ) : checked ? (
        // Flashcard grading — "Knew it" is what marks a card as learned.
        <div className="answer-row">
          <button className="answer-btn again" onClick={gradeAgain}>
            <RefreshCw size={17} />
            {t('train.againBtn')}
          </button>
          <button className="answer-btn known" onClick={gradeKnown}>
            <Check size={17} />
            {t('train.knownBtn')}
          </button>
        </div>
      ) : (
        <button className="reveal-btn" onClick={() => setChecked(true)}>
          {t('train.reveal')}
        </button>
      )}
    </div>
  );
}
