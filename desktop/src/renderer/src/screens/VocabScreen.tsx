import { useState } from 'react';
import { Languages, Plus, X, BookOpen, Copy, Check, PencilLine } from 'lucide-react';
import { Settings, VocabItem } from '../storage';
import { exportVocab } from '../export';
import { findLanguage, speechLocale } from '../languages';
import { Row } from '../components/Row';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges, TagModal } from '../components/TagModal';
import { QuizItem, TypeQuiz } from '../components/TypeQuiz';
import { ExportMenu } from '../components/ExportMenu';
import { useT } from '../i18n/I18nContext';
import type { TFn } from '../i18n';

type Props = {
  vocab: VocabItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onAdd: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags'>[]) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  tagSuggestions: string[];
};

export function VocabScreen({ vocab, settings, onRemove, onAdd, onUpdate, tagSuggestions }: Props) {
  const t = useT();
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'list' | 'quiz'>('list');

  // Only vocab in the currently selected goal language.
  const shown = vocab.filter((v) => v.lang === settings.goalLanguage);

  const goalLang = findLanguage(settings.goalLanguage);

  // Quiz over words that have a meaning to show as the prompt. For romanized
  // goal languages (Chinese, Japanese …) the learner types the pinyin/romaji.
  const quizItems: QuizItem[] = shown
    .filter((v) => v.translation.trim())
    .map((v) => ({
      id: v.id,
      prompt: v.translation,
      answer: v.term,
      pinyin: v.pinyin,
      tags: v.tags,
      lang: v.lang,
    }));

  function submit() {
    if (!term.trim()) return;
    onAdd([{ term: term.trim(), translation: translation.trim(), lang: settings.goalLanguage }]);
    setTerm('');
    setTranslation('');
    setAdding(false);
  }

  return (
    <div className="screen">
      <div className="list-head">
        <div className="head-left">
          <span className="lang-badge">
            <Languages size={14} />
            {findLanguage(settings.goalLanguage).nativeName}
          </span>
          <span className="count">
            {shown.length} {shown.length === 1 ? t('vocab.one') : t('vocab.many')}
          </span>
        </div>
        {mode === 'list' && (
          <div className="head-right">
            {shown.length > 0 && (
              <ExportMenu onPick={(f) => exportVocab(shown, settings.goalLanguage, f)} />
            )}
            <button className="add-toggle" onClick={() => setAdding((v) => !v)}>
              {adding ? <X size={15} /> : <Plus size={15} />}
              {adding ? t('common.cancel') : t('common.new')}
            </button>
          </div>
        )}
      </div>

      <div className="segment sub">
        <button
          className={`seg-btn${mode === 'list' ? ' active' : ''}`}
          onClick={() => setMode('list')}
        >
          <BookOpen size={15} />
          {t('tab.vocab')}
        </button>
        <button
          className={`seg-btn${mode === 'quiz' ? ' active' : ''}`}
          onClick={() => {
            setAdding(false);
            setMode('quiz');
          }}
        >
          <PencilLine size={15} />
          {t('quiz.tab')}
        </button>
      </div>

      {mode === 'quiz' ? (
        <TypeQuiz
          items={quizItems}
          romanized={!!goalLang.romanize}
          answerLangName={goalLang.nativeName}
          locale={speechLocale(goalLang)}
          tagSuggestions={tagSuggestions}
        />
      ) : (
        <>
      {adding && (
        <div className="add-card">
          <input
            className="field"
            autoFocus
            placeholder={t('vocab.wordPlaceholder', {
              lang: findLanguage(settings.goalLanguage).nativeName,
            })}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <input
            className="field"
            placeholder={t('vocab.translationPlaceholder', {
              lang: findLanguage(settings.inputLanguage).nativeName,
            })}
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="save-btn cyan" onClick={submit}>
            {t('common.save')}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <BookOpen size={52} className="faint" />
          <p>{t('vocab.emptyText', { lang: findLanguage(settings.goalLanguage).nativeName })}</p>
        </div>
      ) : (
        <div className="list">
          {shown.map((item) => (
            <VocabRow
              key={item.id}
              item={item}
              onRemove={onRemove}
              onUpdate={onUpdate}
              tagSuggestions={tagSuggestions}
              t={t}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function VocabRow({
  item,
  onRemove,
  onUpdate,
  tagSuggestions,
  t,
}: {
  item: VocabItem;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  tagSuggestions: string[];
  t: TFn;
}) {
  const locale = speechLocale(findLanguage(item.lang));
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(
      [item.term, item.pinyin, item.translation].filter(Boolean).join(' — ')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Row
      onDelete={() => onRemove(item.id)}
      onTap={() => setTagModalOpen(true)}
      deleteLabel={t('swipe.delete')}
    >
      <div className="vocab-inner">
        <div className="vocab-main">
          <div className="term">{item.term}</div>
          {!!item.pinyin && <div className="pinyin">{item.pinyin}</div>}
          {!!item.translation && <div className="trans">{item.translation}</div>}
          {!!item.example && (
            <div className="example-block">
              <div className="example">„{item.example}"</div>
              {!!item.examplePinyin && <div className="example-pinyin">{item.examplePinyin}</div>}
              {!!item.exampleTranslation && (
                <div className="example-trans">{item.exampleTranslation}</div>
              )}
            </div>
          )}
          <TagBadges tags={item.tags} />
        </div>
        <button
          className={`icon-soft${copied ? ' ok' : ''}`}
          onClick={copy}
          aria-label={t('vocab.copy')}
          title={t('vocab.copy')}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <span onClick={(e) => e.stopPropagation()}>
          <SpeakButton
            text={item.example ? `${item.term}. ${item.example}` : item.term}
            locale={locale}
          />
        </span>
      </div>

      <TagModal
        visible={tagModalOpen}
        title={t('tagModal.title')}
        subtitle={item.term}
        addLabel={t('vocab.tag')}
        tags={item.tags}
        suggestions={tagSuggestions}
        onChange={(tags) => onUpdate(item.id, { tags })}
        onClose={() => setTagModalOpen(false)}
      />
    </Row>
  );
}
