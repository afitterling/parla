import { useEffect, useMemo, useState } from 'react';
import {
  Languages,
  List,
  GraduationCap,
  Trophy,
  RefreshCw,
  Check,
  X,
  PencilLine,
} from 'lucide-react';
import { PhraseItem, Settings, recentTags } from '../storage';
import { exportPhrases } from '../export';
import { findLanguage, speechLocale } from '../languages';
import { Row } from '../components/Row';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges, TagModal } from '../components/TagModal';
import { QuizItem, TypeQuiz } from '../components/TypeQuiz';
import { ExportMenu } from '../components/ExportMenu';
import { useT } from '../i18n/I18nContext';

type Props = {
  phrases: PhraseItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
};

type View2 = 'list' | 'train' | 'quiz';

export function PhraseScreen({ phrases, onRemove, onUpdate, settings }: Props) {
  const t = useT();
  const [view, setView] = useState<View2>('list');
  const [learnPhrase, setLearnPhrase] = useState<PhraseItem | null>(null);

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
        {shown.length > 0 && (
          <span className="push-right">
            <ExportMenu onPick={(f) => exportPhrases(shown, settings.goalLanguage, f)} />
          </span>
        )}
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
            setView('quiz');
          }}
        >
          <PencilLine size={15} />
          {t('quiz.tab')}
        </button>
      </div>

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
    }));

  return (
    <TypeQuiz
      items={items}
      romanized={!!goalLang.romanize}
      answerLangName={goalLang.nativeName}
      locale={speechLocale(goalLang)}
      tagSuggestions={tagSuggestions}
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
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<'latest' | 'tag'>('latest');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return phrases.filter((p) => {
      const matchSearch =
        !q ||
        p.target.toLowerCase().includes(q) ||
        p.translation.toLowerCase().includes(q) ||
        p.tags.some((tg) => tg.toLowerCase().includes(q));
      const matchTag =
        !filterTag || p.tags.some((tg) => tg.toLowerCase() === filterTag.toLowerCase());
      return matchSearch && matchTag;
    });
  }, [phrases, search, filterTag]);

  const latest = useMemo(() => [...filtered].sort((a, b) => b.createdAt - a.createdAt), [filtered]);

  const sections = useMemo(() => {
    const tagSet = new Set<string>();
    filtered.forEach((p) => p.tags.forEach((tg) => tagSet.add(tg)));
    let tagList = [...tagSet].sort((a, b) => a.localeCompare(b));
    if (filterTag) tagList = tagList.filter((tg) => tg.toLowerCase() === filterTag.toLowerCase());
    const secs = tagList.map((tag) => ({
      title: tag,
      data: filtered
        .filter((p) => p.tags.some((tg) => tg.toLowerCase() === tag.toLowerCase()))
        .sort((a, b) => b.createdAt - a.createdAt),
    }));
    if (!filterTag) {
      const untagged = filtered
        .filter((p) => p.tags.length === 0)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (untagged.length) secs.push({ title: t('phrase.untagged'), data: untagged });
    }
    return secs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, filterTag]);

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
      <div className="controls">
        <input
          className="search"
          placeholder={t('phrase.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="order-toggle">
          <button
            className={`order-btn${ordering === 'latest' ? ' active' : ''}`}
            onClick={() => setOrdering('latest')}
          >
            {t('phrase.latest')}
          </button>
          <button
            className={`order-btn${ordering === 'tag' ? ' active' : ''}`}
            onClick={() => setOrdering('tag')}
          >
            {t('phrase.byTag')}
          </button>
        </div>
      </div>

      <TagFilterRow tags={tagSuggestions} value={filterTag} onChange={setFilterTag} />

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
  }

  function reset() {
    setQueue(null);
    setRevealed(false);
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

  function known() {
    onUpdate(current!.id, { reviews: current!.reviews + 1, known: current!.known + 1 });
    setQueue((q) => (q ? q.slice(1) : q));
    setRevealed(false);
  }

  function again() {
    onUpdate(current!.id, { reviews: current!.reviews + 1 });
    setQueue((q) => (q ? [...q.slice(1), q[0]] : q));
    setRevealed(false);
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

      <div className="flashcard" onClick={() => !revealed && setRevealed(true)}>
        <div className="side">
          {direction === 'de2t' ? t('train.native') : t('train.targetLang')}
        </div>
        <div className="front">{frontText}</div>
        {direction === 't2de' && !!current.pinyin && <div className="cpinyin">{current.pinyin}</div>}
        {revealed ? (
          <>
            <div className="divider" />
            <div className="back">{backText}</div>
            {direction === 'de2t' && !!current.pinyin && (
              <div className="cpinyin">{current.pinyin}</div>
            )}
            <TagBadges tags={current.tags} />
          </>
        ) : (
          <div className="hint">{t('train.tapToReveal')}</div>
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
        <button className="reveal-btn" onClick={() => setRevealed(true)}>
          {t('train.reveal')}
        </button>
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
