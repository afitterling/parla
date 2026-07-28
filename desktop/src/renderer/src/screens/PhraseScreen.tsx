import { useEffect, useMemo, useState } from 'react';
import {
  Languages,
  List,
  GraduationCap,
  Trophy,
  RefreshCw,
  Check,
  X,
  Plus,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  PencilLine,
} from 'lucide-react';
import {
  AnswerMode,
  PhraseItem,
  Settings,
  loadQuizPrefs,
  recentTags,
  saveQuizPrefs,
} from '../storage';
import { answerMatches } from '../answers';
import { transcribeAudio, translatePhrase } from '../api';
import { exportPhrases } from '../export';
import { findLanguage, speechLocale } from '../languages';
import { useRecorder } from '../recorder';
import { Row } from '../components/Row';
import { MicButton } from '../components/MicButton';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges, TagModal } from '../components/TagModal';
import { QuizItem, TypeQuiz } from '../components/TypeQuiz';
import { ExportMenu } from '../components/ExportMenu';
import {
  useTaggedList,
  ListControls,
  TagFilterRow as SharedTagFilterRow,
} from '../components/TaggedList';
import { useT } from '../i18n/I18nContext';

type Props = {
  phrases: PhraseItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  onAdd: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  tagSuggestions: string[];
};

type View2 = 'list' | 'train' | 'quiz';

export function PhraseScreen({ phrases, onRemove, onUpdate, onAdd, settings }: Props) {
  const t = useT();
  const [view, setView] = useState<View2>('list');
  const [learnPhrase, setLearnPhrase] = useState<PhraseItem | null>(null);
  const [adding, setAdding] = useState(false);

  // Only phrases in the currently selected goal language.
  const shown = phrases.filter((p) => p.lang === settings.goalLanguage);
  const tags = recentTags(shown);

  function startLearn(item: PhraseItem) {
    setLearnPhrase(item);
    setView('train');
  }

  return (
    <div className="screen">
      <div className="top-row">
        <span className="lang-badge">
          <Languages size={14} />
          {findLanguage(settings.goalLanguage).nativeName}
        </span>
        <span className="count">
          {shown.length} {shown.length === 1 ? t('phrase.one') : t('phrase.many')}
        </span>
        <span className="head-right">
          {shown.length > 0 && (
            <ExportMenu onPick={(f) => exportPhrases(shown, settings.goalLanguage, f)} />
          )}
          {view === 'list' && (
            <button className="add-toggle" onClick={() => setAdding((v) => !v)}>
              {adding ? <X size={15} /> : <Plus size={15} />}
              {adding ? t('common.cancel') : t('phrase.ask')}
            </button>
          )}
        </span>
      </div>

      <div className="segment sub">
        <button
          className={`seg-btn${view === 'list' ? ' active' : ''}`}
          onClick={() => setView('list')}
        >
          <List size={15} />
          {t('phrase.list')}
        </button>
        <button
          className={`seg-btn${view === 'train' ? ' active' : ''}`}
          onClick={() => {
            setLearnPhrase(null);
            setAdding(false);
            setView('train');
          }}
        >
          <GraduationCap size={15} />
          {t('phrase.training')}
        </button>
        <button
          className={`seg-btn${view === 'quiz' ? ' active' : ''}`}
          onClick={() => {
            setLearnPhrase(null);
            setAdding(false);
            setView('quiz');
          }}
        >
          <PencilLine size={15} />
          {t('quiz.tab')}
        </button>
      </div>

      {view === 'list' && adding && (
        <PhraseAdd
          settings={settings}
          onAdd={onAdd}
          onDone={() => setAdding(false)}
        />
      )}
      {view === 'list' && (
        <ListView
          phrases={shown}
          onRemove={onRemove}
          onUpdate={onUpdate}
          tagSuggestions={tags}
          onLearn={startLearn}
        />
      )}
      {view === 'train' && (
        <TrainView
          phrases={shown}
          onUpdate={onUpdate}
          tagSuggestions={tags}
          learnPhrase={learnPhrase}
          onClearLearn={() => setLearnPhrase(null)}
        />
      )}
      {view === 'quiz' && (
        <QuizView phrases={shown} onUpdate={onUpdate} tagSuggestions={tags} settings={settings} />
      )}
    </div>
  );
}

// ── "How would I say …" ──────────────────────────────────────────────────────
// Type (or speak) what you want to say in your own language, let it be turned
// into the phrase a native speaker would use, then save it like any other
// phrase. Works in both directions: fill either field and translate the other.
function PhraseAdd({
  settings,
  onAdd,
  onDone,
}: {
  settings: Settings;
  onAdd: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onDone: () => void;
}) {
  const t = useT();
  const [ask, setAsk] = useState(''); // what the learner wants to say (input language)
  const [target, setTarget] = useState(''); // the phrase in the goal language
  // Reading of the target, prefilled by the translation; cleared when the
  // target is edited by hand (the reading belongs to that exact wording).
  const [reading, setReading] = useState('');
  const [translating, setTranslating] = useState(false);
  const recorder = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [micTarget, setMicTarget] = useState<'ask' | 'target'>('ask');

  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  const wantReading = !!goalLang.romanize;

  // Speak instead of typing: click to record, click again to stop and
  // transcribe. The ask field records in the learner's language, the target
  // field in the goal language.
  async function onMicPress(field: 'ask' | 'target') {
    if (recorder.state === 'recording') {
      try {
        setTranscribing(true);
        const blob = await recorder.stop();
        if (blob) {
          const lang = micTarget === 'ask' ? inputLang : goalLang;
          const text = (await transcribeAudio(blob, settings.openaiKey, lang)).trim();
          if (!text) window.alert(t('dialog.errorNoSpeech'));
          else if (micTarget === 'ask') setAsk(text);
          else {
            setTarget(text);
            setReading('');
          }
        }
      } catch (e: any) {
        window.alert(e?.message ?? String(e));
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        setMicTarget(field);
        await recorder.start();
      } catch (e: any) {
        window.alert(e?.message ?? t('dialog.errorRecording'));
      }
    }
  }

  // Fill the empty side from the filled one — the "how would I say" direction
  // is the common one, the reverse turns an overheard phrase into an entry.
  async function translate() {
    if (translating) return;
    const haveAsk = !!ask.trim();
    const haveTarget = !!target.trim();
    if (haveAsk === haveTarget) return;
    setTranslating(true);
    try {
      if (haveAsk) {
        const res = await translatePhrase(
          settings.openaiKey,
          ask.trim(),
          inputLang,
          goalLang,
          wantReading
        );
        setTarget(res.text);
        setReading(res.reading ?? '');
      } else {
        const res = await translatePhrase(
          settings.openaiKey,
          target.trim(),
          goalLang,
          inputLang,
          false
        );
        setAsk(res.text);
      }
    } catch (e: any) {
      window.alert(e?.message ?? String(e));
    } finally {
      setTranslating(false);
    }
  }

  function submit() {
    if (!target.trim()) return;
    onAdd({
      target: target.trim(),
      translation: ask.trim(),
      pinyin: reading.trim() || undefined,
      lang: settings.goalLanguage,
      tags: [],
    });
    setAsk('');
    setTarget('');
    setReading('');
    onDone();
  }

  const oneSideFilled = !!ask.trim() !== !!target.trim();

  return (
    <div className="add-card">
      <div className="add-input-row">
        <input
          className="field"
          autoFocus
          placeholder={t('phrase.askPlaceholder', { lang: inputLang.nativeName })}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (oneSideFilled ? translate() : submit())}
        />
        <MicButton
          recording={recorder.state === 'recording' && micTarget === 'ask'}
          busy={transcribing && micTarget === 'ask'}
          onClick={() => onMicPress('ask')}
          label={t('phrase.speakAsk')}
        />
      </div>
      <div className="add-input-row">
        <input
          className="field"
          placeholder={t('phrase.targetPlaceholder', { lang: goalLang.nativeName })}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setReading('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <MicButton
          recording={recorder.state === 'recording' && micTarget === 'target'}
          busy={transcribing && micTarget === 'target'}
          onClick={() => onMicPress('target')}
          label={t('phrase.speakTarget')}
        />
      </div>
      {!!reading && <div className="add-pinyin">{reading}</div>}
      {oneSideFilled && (
        <button className="translate-btn" onClick={translate} disabled={translating}>
          {translating ? <span className="spinner" /> : <Sparkles size={16} />}
          {t('vocab.translate')}
        </button>
      )}
      <button className="save-btn cyan" onClick={submit} disabled={!target.trim()}>
        {t('common.save')}
      </button>
    </div>
  );
}

// ── Type quiz ────────────────────────────────────────────────────────────────
function QuizView({
  phrases,
  onUpdate,
  tagSuggestions,
  settings,
}: {
  phrases: PhraseItem[];
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
  settings: Settings;
}) {
  const goalLang = findLanguage(settings.goalLanguage);
  const items: QuizItem[] = phrases
    .filter((p) => p.translation.trim())
    .map((p) => ({
      id: p.id,
      prompt: p.translation,
      answer: p.target,
      pinyin: p.pinyin,
      tags: p.tags,
      lang: p.lang,
      known: p.known,
    }));

  return (
    <TypeQuiz
      items={items}
      romanized={!!goalLang.romanize}
      answerLangName={goalLang.nativeName}
      locale={speechLocale(goalLang)}
      tagSuggestions={tagSuggestions}
      scope="phrases"
      onResult={(id, correct) => {
        const p = phrases.find((x) => x.id === id);
        if (!p) return;
        onUpdate(id, { reviews: p.reviews + 1, known: p.known + (correct ? 1 : 0) });
      }}
    />
  );
}

// ── List / Lookup ────────────────────────────────────────────────────────────
function ListView({
  phrases,
  onRemove,
  onUpdate,
  tagSuggestions,
  onLearn,
}: {
  phrases: PhraseItem[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
  onLearn: (item: PhraseItem) => void;
}) {
  const t = useT();
  const { search, setSearch, ordering, setOrdering, filterTags, setFilterTags, latest, sections } =
    useTaggedList(
      phrases,
      (p) => `${p.target} ${p.pinyin ?? ''} ${p.translation} ${p.tags.join(' ')}`.toLowerCase(),
      t('phrase.untagged')
    );

  if (phrases.length === 0) {
    return (
      <div className="empty">
        <GraduationCap size={52} className="faint" />
        <p>{t('phrase.emptyText')}</p>
      </div>
    );
  }

  const renderRow = (item: PhraseItem) => (
    <PhraseRow
      key={item.id}
      item={item}
      onRemove={onRemove}
      onUpdate={onUpdate}
      tagSuggestions={tagSuggestions}
      onLearn={onLearn}
    />
  );

  return (
    <div className="flex-col">
      <ListControls
        search={search}
        onSearch={setSearch}
        ordering={ordering}
        onOrdering={setOrdering}
        placeholder={t('phrase.searchPlaceholder')}
        latestLabel={t('phrase.latest')}
        byTagLabel={t('phrase.byTag')}
      />
      <SharedTagFilterRow
        tags={recentTags(phrases)}
        value={filterTags}
        onChange={setFilterTags}
        allLabel={t('common.all')}
      />

      <div className="list">
        {ordering === 'latest' ? (
          latest.length ? (
            latest.map(renderRow)
          ) : (
            <p className="no-match">{t('phrase.noMatch')}</p>
          )
        ) : sections.length ? (
          sections.map((section) => (
            <div key={section.title}>
              <div className="section-head">
                {section.title} · {section.data.length}
              </div>
              {section.data.map(renderRow)}
            </div>
          ))
        ) : (
          <p className="no-match">{t('phrase.noMatch')}</p>
        )}
      </div>
    </div>
  );
}

function PhraseRow({
  item,
  onRemove,
  onUpdate,
  tagSuggestions,
  onLearn,
}: {
  item: PhraseItem;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
  onLearn: (item: PhraseItem) => void;
}) {
  const t = useT();
  const [tagModalOpen, setTagModalOpen] = useState(false);

  return (
    <Row
      onDelete={() => onRemove(item.id)}
      onLearn={() => onLearn(item)}
      onTap={() => setTagModalOpen(true)}
      deleteLabel={t('swipe.delete')}
      learnLabel={t('swipe.learn')}
    >
      <div className="phrase-inner">
        <span className="speak-abs" onClick={(e) => e.stopPropagation()}>
          <SpeakButton text={item.target} locale={speechLocale(findLanguage(item.lang))} />
        </span>
        <div className="target with-speak">{item.target}</div>
        {!!item.pinyin && <div className="pinyin">{item.pinyin}</div>}
        {!!item.translation && <div className="trans">{item.translation}</div>}
        <TagBadges tags={item.tags} />
        {item.reviews > 0 && (
          <div className="stat">{t('phrase.known', { known: item.known, reviews: item.reviews })}</div>
        )}
      </div>

      <TagModal
        visible={tagModalOpen}
        title={t('tagModal.title')}
        subtitle={item.target}
        addLabel={t('phrase.tag')}
        tags={item.tags}
        suggestions={tagSuggestions}
        onChange={(tags) => onUpdate(item.id, { tags })}
        onClose={() => setTagModalOpen(false)}
      />
    </Row>
  );
}

// ── Training / Flashcards ────────────────────────────────────────────────────
function TrainView({
  phrases,
  onUpdate,
  tagSuggestions,
  learnPhrase,
  onClearLearn,
}: {
  phrases: PhraseItem[];
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
  learnPhrase: PhraseItem | null;
  onClearLearn: () => void;
}) {
  const t = useT();
  // Show the original target-language phrase first by default.
  const [direction, setDirection] = useState<'de2t' | 't2de'>('t2de');
  const [sessionTag, setSessionTag] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[] | null>(null); // ids; null = not started
  const [total, setTotal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Recall mode: type the answer instead of just flipping the card. Remembered
  // across sessions like the quiz's selection.
  const [answerMode, setAnswerMode] = useState<AnswerMode>('reveal');
  const [input, setInput] = useState('');
  const [lastCorrect, setLastCorrect] = useState(false);

  useEffect(() => {
    let alive = true;
    loadQuizPrefs('train').then((p) => {
      if (alive) setAnswerMode(p.answerMode);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function chooseAnswerMode(mode: AnswerMode) {
    setAnswerMode(mode);
    saveQuizPrefs('train', { ...(await loadQuizPrefs('train')), answerMode: mode });
  }

  const pool = useMemo(
    () =>
      phrases.filter(
        (p) => !sessionTag || p.tags.some((tg) => tg.toLowerCase() === sessionTag.toLowerCase())
      ),
    [phrases, sessionTag]
  );

  // Single-phrase "Learn" flow: start a one-card session immediately.
  useEffect(() => {
    if (learnPhrase) {
      setDirection('t2de');
      setQueue([learnPhrase.id]);
      setTotal(1);
      setRevealed(false);
    }
  }, [learnPhrase]);

  // Drop a card whose phrase vanished (deleted elsewhere) and continue.
  useEffect(() => {
    if (queue && queue.length > 0 && !phrases.find((p) => p.id === queue[0])) {
      setQueue((q) => (q ? q.slice(1) : q));
    }
  }, [queue, phrases]);

  function start() {
    if (learnPhrase) {
      setQueue([learnPhrase.id]);
      setTotal(1);
      setRevealed(false);
      setInput('');
      return;
    }
    const ids = pool.map((p) => p.id);
    // Fisher–Yates shuffle.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setQueue(ids);
    setTotal(ids.length);
    setRevealed(false);
    setInput('');
  }

  function reset() {
    setQueue(null);
    setRevealed(false);
    setInput('');
    onClearLearn();
  }

  // Setup screen
  if (queue === null) {
    return (
      <div className="flex-col">
        <div className="train-hint">{t('train.direction')}</div>
        <div className="order-toggle inset">
          <button
            className={`order-btn${direction === 'de2t' ? ' active' : ''}`}
            onClick={() => setDirection('de2t')}
          >
            {t('train.de2t')}
          </button>
          <button
            className={`order-btn${direction === 't2de' ? ' active' : ''}`}
            onClick={() => setDirection('t2de')}
          >
            {t('train.t2de')}
          </button>
        </div>

        <div className="train-hint">{t('train.answerMode')}</div>
        <div className="order-toggle inset">
          <button
            className={`order-btn${answerMode === 'reveal' ? ' active' : ''}`}
            onClick={() => chooseAnswerMode('reveal')}
          >
            {t('train.modeReveal')}
          </button>
          <button
            className={`order-btn${answerMode === 'type' ? ' active' : ''}`}
            onClick={() => chooseAnswerMode('type')}
          >
            {t('train.modeType')}
          </button>
        </div>

        <div className="train-hint">{t('train.whichPhrases')}</div>
        <TagFilterRow tags={tagSuggestions} value={sessionTag} onChange={setSessionTag} />

        <div className="train-center">
          <div className="pool-count">
            {pool.length} {pool.length === 1 ? t('phrase.one') : t('phrase.many')}
            {sessionTag ? t('train.withTag', { tag: sessionTag }) : ''}
          </div>
          <button className="big-btn" disabled={pool.length === 0} onClick={start}>
            {t('train.start')}
          </button>
          {pool.length === 0 && (
            <p className="no-match">
              {sessionTag ? t('train.noPhrasesInTag') : t('train.noPhrases')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Done screen
  if (queue.length === 0) {
    return (
      <div className="train-center">
        <Trophy size={52} className="ink" />
        <h2 className="done-title">{t('train.doneTitle', { total })}</h2>
        <button className="big-btn" onClick={start}>
          {t('train.again')}
        </button>
        <button className="link-plain" onClick={reset}>
          {t('train.changeSettings')}
        </button>
      </div>
    );
  }

  const current = phrases.find((p) => p.id === queue[0]);
  if (!current) return null; // effect above will prune it

  const front = direction === 'de2t' ? current.translation : current.target;
  const back = direction === 'de2t' ? current.target : current.translation;
  const frontText = front || t('train.noTranslation');
  const backText = back || t('train.noTranslation');
  const done = total - queue.length;

  // Typing mode: what counts as the right answer for the current direction.
  // Answering a Chinese/Japanese card in romanization is accepted too, so no
  // Chinese keyboard is needed.
  const typing = answerMode === 'type';
  const cardLang = findLanguage(current.lang);
  const typeTarget = direction === 'de2t'; // typing the goal language, not the meaning
  const accepted = typeTarget ? [current.target, current.pinyin] : [current.translation];

  function known() {
    onUpdate(current!.id, { reviews: current!.reviews + 1, known: current!.known + 1 });
    setQueue((q) => (q ? q.slice(1) : q));
    setRevealed(false);
    setInput('');
  }

  function again() {
    onUpdate(current!.id, { reviews: current!.reviews + 1 });
    setQueue((q) => (q ? [...q.slice(1), q[0]] : q));
    setRevealed(false);
    setInput('');
  }

  function check() {
    if (revealed || !input.trim()) return;
    setLastCorrect(answerMatches(input, accepted));
    setRevealed(true);
  }

  return (
    <div className="flex-col">
      <div className="progress">
        <span className="num">
          {done}/{total}
        </span>
        <span className="dir">{direction === 'de2t' ? t('train.de2t') : t('train.t2de')}</span>
        <button className="icon-plain" onClick={reset} aria-label={t('common.done')}>
          <X size={20} />
        </button>
      </div>

      <div className="flashcard" onClick={() => !revealed && !typing && setRevealed(true)}>
        <div className="side">
          {direction === 'de2t' ? t('train.native') : t('train.targetLang')}
        </div>
        <div className="front">{frontText}</div>
        {direction === 't2de' && !!current.pinyin && <div className="cpinyin">{current.pinyin}</div>}

        {typing && (
          <>
            <div className="quiz-hint">
              {!typeTarget
                ? t('train.typeMeaning')
                : cardLang.romanize
                  ? t('quiz.typePinyin')
                  : t('quiz.typeAnswer', { lang: cardLang.nativeName })}
            </div>
            <div className="type-row">
              <input
                // Remount per card so autoFocus fires again on the next one.
                key={current.id}
                className={`quiz-input${revealed ? (lastCorrect ? ' correct' : ' wrong') : ''}`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && check()}
                disabled={revealed}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={typeTarget && cardLang.romanize ? 'pinyin …' : '…'}
              />
              {!revealed && (
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

        {revealed ? (
          <>
            {typing && (
              <div className={`quiz-verdict${lastCorrect ? ' ok' : ' bad'}`}>
                {lastCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {lastCorrect ? t('quiz.correct') : t('quiz.wrong')}
              </div>
            )}
            <div className="divider" />
            <div className="back">{backText}</div>
            {direction === 'de2t' && !!current.pinyin && (
              <div className="cpinyin">{current.pinyin}</div>
            )}
            <TagBadges tags={current.tags} />
          </>
        ) : (
          !typing && <div className="hint">{t('train.tapToReveal')}</div>
        )}
      </div>

      {revealed ? (
        <div className="answer-row">
          <button className="answer-btn again" onClick={again}>
            <RefreshCw size={17} />
            {t('train.againBtn')}
          </button>
          <button className="answer-btn known" onClick={known}>
            <Check size={17} />
            {t('train.knownBtn')}
          </button>
        </div>
      ) : (
        !typing && (
          <button className="reveal-btn" onClick={() => setRevealed(true)}>
            {t('train.reveal')}
          </button>
        )
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
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
      <button
        className={`filter-chip${value === null ? ' on' : ''}`}
        onClick={() => onChange(null)}
      >
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
