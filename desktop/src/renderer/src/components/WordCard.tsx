import { useEffect, useState } from 'react';
import { X, Brush, Sparkles, RefreshCw, Tag, GraduationCap } from 'lucide-react';
import { VocabItem } from '../storage';
import { transliterate } from '../api';
import { findLanguage, speechLocale, usesHanzi, hasHanzi } from '../languages';
import { useT } from '../i18n/I18nContext';
import { SpeakButton } from './SpeakButton';
import { StrokeOrderView } from './StrokeOrderView';
import { TagModal, TagBadges } from './TagModal';

// Full-screen "lens" view of a single vocabulary card, opened by clicking the
// row. Shows the word large with its reading, translation and example, offers a
// stroke-practice toggle for Han terms, on-demand reading backfill, and tag
// editing.
type Props = {
  item: VocabItem | null;
  suggestions: string[];
  openaiKey: string;
  onChange: (tags: string[]) => void;
  /** Persist a backfilled reading onto the word. */
  onFillPinyin: (pinyin: string) => void;
  /** Drill this one word on repeat (LearnDrill). */
  onLearn: () => void;
  onClose: () => void;
  /** Open straight into stroke practice instead of the word side. */
  initialStrokes?: boolean;
};

export function WordCard({
  item,
  suggestions,
  openaiKey,
  onChange,
  onFillPinyin,
  onLearn,
  onClose,
  initialStrokes = false,
}: Props) {
  const t = useT();
  const [strokes, setStrokes] = useState(initialStrokes);
  const [fetchingPinyin, setFetchingPinyin] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  useEffect(() => {
    setStrokes(initialStrokes);
  }, [initialStrokes, item?.id]);

  // Escape gets you out — the close button sits under the window's traffic
  // lights corner, so a keyboard way out matters.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  const lang = findLanguage(item.lang);
  const canPinyin = !!lang.romanize;
  const canStrokes = usesHanzi(item.lang) && hasHanzi(item.term);
  const locale = speechLocale(lang);

  async function fillPinyin() {
    if (!item || fetchingPinyin) return;
    setFetchingPinyin(true);
    try {
      onFillPinyin(await transliterate(openaiKey, item.term, lang));
    } catch (e: any) {
      window.alert(e?.message ?? String(e));
    } finally {
      setFetchingPinyin(false);
    }
  }

  return (
    <div className="wordcard-root">
      <div className="wordcard-top">
        <button className="wordcard-icon" onClick={onClose} aria-label={t('tagModal.close')}>
          <X size={22} />
        </button>
        <div className="wordcard-top-right">
          <button className="wordcard-strokes-toggle" onClick={onLearn}>
            <GraduationCap size={16} />
            {t('swipe.learn')}
          </button>
          {canStrokes && (
            <button
              className={`wordcard-strokes-toggle${strokes ? ' on' : ''}`}
              onClick={() => setStrokes((v) => !v)}
            >
              <Brush size={16} />
              {t('vocab.strokes')}
            </button>
          )}
          <SpeakButton
            text={item.example ? `${item.term}. ${item.example}` : item.term}
            locale={locale}
          />
        </div>
      </div>

      <div className="wordcard-body">
        {strokes ? (
          <StrokeOrderView term={item.term} size={280} />
        ) : (
          <div className="wordcard-word">
            <div className="wordcard-term">{item.term}</div>
            {item.pinyin ? (
              <div className="wordcard-pinyin-row">
                <span className="wordcard-pinyin">{item.pinyin}</span>
                {canPinyin && (
                  <button
                    className="wordcard-refresh"
                    onClick={fillPinyin}
                    disabled={fetchingPinyin}
                    aria-label={t('vocab.makePinyin')}
                  >
                    {fetchingPinyin ? <span className="spinner" /> : <RefreshCw size={16} />}
                  </button>
                )}
              </div>
            ) : (
              canPinyin && (
                <button className="wordcard-makepinyin" onClick={fillPinyin} disabled={fetchingPinyin}>
                  {fetchingPinyin ? <span className="spinner" /> : <Sparkles size={16} />}
                  {t('vocab.makePinyin')}
                </button>
              )
            )}
            {!!item.translation && <div className="wordcard-trans">{item.translation}</div>}
            {!!item.example && (
              <div className="wordcard-example-block">
                <div className="wordcard-example">„{item.example}"</div>
                {!!item.examplePinyin && (
                  <div className="wordcard-example-pinyin">{item.examplePinyin}</div>
                )}
                {!!item.exampleTranslation && (
                  <div className="wordcard-example-trans">{item.exampleTranslation}</div>
                )}
              </div>
            )}
            <div className="wordcard-tags">
              <TagBadges tags={item.tags} />
              <button className="wordcard-tag-btn" onClick={() => setTagsOpen(true)}>
                <Tag size={14} />
                {t('vocab.tag')}
              </button>
            </div>
          </div>
        )}
      </div>

      <TagModal
        visible={tagsOpen}
        title={t('tagModal.title')}
        subtitle={item.term}
        addLabel={t('vocab.tag')}
        tags={item.tags}
        suggestions={suggestions}
        onChange={onChange}
        onClose={() => setTagsOpen(false)}
      />
    </div>
  );
}
