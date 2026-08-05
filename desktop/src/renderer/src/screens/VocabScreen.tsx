import { useState } from 'react';
import {
  Languages,
  Plus,
  X,
  BookOpen,
  Copy,
  Check,
  PencilLine,
  ScanText,
  Sparkles,
  RefreshCw,
  Brush,
  GraduationCap,
} from 'lucide-react';
import { Settings, VocabItem, isPaywallActive, recentTags } from '../storage';
import { exportVocab } from '../export';
import {
  generateVocabExample,
  scanImageForVocab,
  transcribeAudio,
  translateVocabTerm,
} from '../api';
import { findLanguage, speechLocale, usesHanzi, hasHanzi } from '../languages';
import { useRecorder } from '../recorder';
import { useScanFlow } from '../useScanFlow';
import { BusyOverlay } from '../components/BusyOverlay';
import { Paywall } from '../components/Paywall';
import { Row } from '../components/Row';
import { MicButton } from '../components/MicButton';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges } from '../components/TagModal';
import { QuizItem, TypeQuiz } from '../components/TypeQuiz';
import { ExportMenu } from '../components/ExportMenu';
import { WordCard } from '../components/WordCard';
import { LearnDrill } from '../components/LearnDrill';
import { useTaggedList, ListControls, TagFilterRow } from '../components/TaggedList';
import { useT } from '../i18n/I18nContext';
import type { TFn } from '../i18n';

type Props = {
  vocab: VocabItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onAdd: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  onPurchasePro: () => void;
  tagSuggestions: string[];
};

export function VocabScreen({
  vocab,
  settings,
  onRemove,
  onAdd,
  onUpdate,
  onPurchasePro,
  tagSuggestions,
}: Props) {
  const t = useT();
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  // Reading of the term, prefilled when the term came from auto-translate; it is
  // cleared when the term is edited by hand (the reading belongs to the term).
  const [termPinyin, setTermPinyin] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mode, setMode] = useState<'list' | 'quiz'>('list');
  const recorder = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [micTarget, setMicTarget] = useState<'term' | 'translation'>('term');
  const [translating, setTranslating] = useState(false);
  // The word currently shown full-screen (WordCard); null = closed.
  const [card, setCard] = useState<{ item: VocabItem; strokes: boolean } | null>(null);
  // The word being drilled on its own (LearnDrill); null = closed.
  const [drillId, setDrillId] = useState<string | null>(null);

  // Only vocab in the currently selected goal language.
  const shown = vocab.filter((v) => v.lang === settings.goalLanguage);

  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  // Generate the reading whenever the goal language has one.
  const wantPinyin = !!goalLang.romanize;

  // Payment-gated: pick a photo of text (a page, sign, menu …) and turn it into
  // dictionary entries. Non-Pro builds hit the paywall; the dev build is exempt
  // (isPaywallActive).
  const scan = useScanFlow({
    paywallActive: isPaywallActive(settings.isPro),
    extract: (base64, signal) =>
      scanImageForVocab(settings.openaiKey, base64, goalLang, inputLang, wantPinyin, signal),
    add: (items) => onAdd(items.map((v) => ({ ...v, lang: settings.goalLanguage }))),
    labels: {
      menuTitle: t('scan.vocabTitle'),
      reading: t('scan.reading'),
      none: t('scan.none'),
      added: (count) => t('scan.addedVocab', { count: String(count) }),
    },
  });

  // Search + tag-filter + group-by-tag over the shown words (shared with Phrases).
  const { search, setSearch, ordering, setOrdering, filterTags, setFilterTags, latest, sections } =
    useTaggedList(
      shown,
      (v) => `${v.term} ${v.pinyin ?? ''} ${v.translation} ${v.tags.join(' ')}`.toLowerCase(),
      t('phrase.untagged')
    );

  // Every word goes to the quiz — which of them can actually be asked depends on
  // the session's direction (a word without a translation can still be asked for
  // its pinyin), so that filtering happens there.
  const quizItems: QuizItem[] = shown.map((v) => ({
    id: v.id,
    term: v.term,
    translation: v.translation,
    pinyin: v.pinyin,
    tags: v.tags,
    lang: v.lang,
    createdAt: v.createdAt,
    known: v.known ?? 0,
  }));

  // A word still needs enrichment if it lacks an example, a translation for that
  // example, or — when the goal language is transliterated — the word's own
  // pinyin or the example's pinyin. This is what "fill all missing" targets.
  function needsEnrich(v: VocabItem): boolean {
    if (!v.example || !v.exampleTranslation) return true;
    if (wantPinyin && (!v.pinyin || !v.examplePinyin)) return true;
    return false;
  }

  // Generate a natural example sentence (+ pinyin + translation) for one word and
  // persist it, also filling the word's own pinyin if it was missing.
  async function generateExample(item: VocabItem) {
    const res = await generateVocabExample(
      settings.openaiKey,
      item.term,
      goalLang,
      inputLang,
      wantPinyin
    );
    onUpdate(item.id, {
      pinyin: item.pinyin || res.termPinyin,
      example: res.example,
      examplePinyin: res.examplePinyin,
      exampleTranslation: res.exampleTranslation,
    });
  }

  // Fill in example sentences for every shown word that still needs it.
  async function generateAllMissing() {
    const missing = shown.filter(needsEnrich);
    if (missing.length === 0) return;
    if (!window.confirm(t('vocab.genAllConfirm', { count: String(missing.length) }))) return;
    setBulkBusy(true);
    let failed = 0;
    for (const item of missing) {
      try {
        await generateExample(item);
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    if (failed > 0) window.alert(t('vocab.genFailed', { count: String(failed) }));
  }

  // Speak instead of typing: click to record, click again to stop and transcribe
  // with Whisper, then drop the text into the field. The term records in the goal
  // language, the translation in the input language.
  async function onMicPress(target: 'term' | 'translation') {
    const active = recorder.state === 'recording' ? micTarget : target;
    if (recorder.state === 'recording') {
      try {
        setTranscribing(true);
        const blob = await recorder.stop();
        if (blob) {
          const lang = micTarget === 'term' ? goalLang : inputLang;
          const text = await transcribeAudio(blob, settings.openaiKey, lang);
          // Whisper punctuates like a sentence — strip that for a vocab entry.
          const cleaned = text.replace(/[。．.．!！?？,，、;；]+$/gu, '').trim();
          if (!cleaned) window.alert(t('dialog.errorNoSpeech'));
          else if (micTarget === 'term') {
            setTerm(cleaned);
            setTermPinyin('');
          } else setTranslation(cleaned);
        }
      } catch (e: any) {
        window.alert(e?.message ?? String(e));
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        setMicTarget(target);
        await recorder.start();
      } catch (e: any) {
        window.alert(e?.message ?? t('dialog.errorRecording'));
      }
    }
    void active;
  }

  // Fill the empty half of the pair from the filled one. Direction is inferred.
  async function onTranslatePress() {
    if (translating) return;
    const haveTerm = !!term.trim();
    const haveTranslation = !!translation.trim();
    if (haveTerm === haveTranslation) return;
    setTranslating(true);
    try {
      if (haveTerm) {
        const res = await translateVocabTerm(settings.openaiKey, term.trim(), goalLang, inputLang, false);
        setTranslation(res.text);
      } else {
        const res = await translateVocabTerm(
          settings.openaiKey,
          translation.trim(),
          inputLang,
          goalLang,
          wantPinyin
        );
        setTerm(res.text);
        setTermPinyin(res.reading ?? '');
      }
    } catch (e: any) {
      window.alert(e?.message ?? String(e));
    } finally {
      setTranslating(false);
    }
  }

  function submit() {
    if (!term.trim()) return;
    onAdd([
      {
        term: term.trim(),
        translation: translation.trim(),
        pinyin: termPinyin.trim() || undefined,
        lang: settings.goalLanguage,
      },
    ]);
    setTerm('');
    setTranslation('');
    setTermPinyin('');
    setAdding(false);
  }

  const oneSideFilled = !!term.trim() !== !!translation.trim();

  // Count a quiz/drill answer on the word itself.
  function recordReview(id: string, correct: boolean) {
    const v = shown.find((x) => x.id === id);
    if (!v) return;
    onUpdate(id, { reviews: (v.reviews ?? 0) + 1, known: (v.known ?? 0) + (correct ? 1 : 0) });
  }

  // Looked up by id, so a word edited while it is being drilled (a backfilled
  // reading, say) updates in place — and a deleted one closes the drill.
  const drillItem = drillId ? shown.find((v) => v.id === drillId) : undefined;

  return (
    <div className="screen">
      {drillItem && (
        <LearnDrill
          item={drillItem}
          goalLangName={goalLang.nativeName}
          nativeLangName={inputLang.nativeName}
          romanized={!!goalLang.romanize}
          locale={speechLocale(goalLang)}
          onResult={(correct) => recordReview(drillItem.id, correct)}
          onClose={() => setDrillId(null)}
        />
      )}

      {card && (
        <WordCard
          item={card.item}
          suggestions={tagSuggestions}
          openaiKey={settings.openaiKey}
          initialStrokes={card.strokes}
          onChange={(tags) => onUpdate(card.item.id, { tags })}
          onFillPinyin={(pinyin) => {
            onUpdate(card.item.id, { pinyin });
            setCard((c) => (c ? { ...c, item: { ...c.item, pinyin } } : c));
          }}
          onLearn={() => {
            setDrillId(card.item.id);
            setCard(null);
          }}
          onClose={() => setCard(null)}
        />
      )}

      <div className="list-head">
        <div className="head-left">
          <span className="lang-badge">
            <Languages size={14} />
            {goalLang.nativeName}
          </span>
          <span className="count">
            {shown.length} {shown.length === 1 ? t('vocab.one') : t('vocab.many')}
          </span>
        </div>
        {mode === 'list' && (
          <div className="head-right">
            {shown.some(needsEnrich) && (
              <button
                className="icon-soft"
                onClick={generateAllMissing}
                disabled={bulkBusy}
                title={t('vocab.genExample')}
                aria-label={t('vocab.genExample')}
              >
                {bulkBusy ? <span className="spinner" /> : <Sparkles size={17} />}
              </button>
            )}
            {shown.length > 0 && (
              <ExportMenu onPick={(f) => exportVocab(shown, settings.goalLanguage, f)} />
            )}
            <button
              className="icon-soft"
              onClick={scan.open}
              title={t('scan.vocabTitle')}
              aria-label={t('scan.vocabTitle')}
            >
              <ScanText size={17} />
            </button>
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
          scope="vocab"
          onResult={recordReview}
        />
      ) : (
        <>
          {adding && (
            <div className="add-card">
              <div className="add-input-row">
                <input
                  className="field"
                  autoFocus
                  placeholder={t('vocab.wordPlaceholder', { lang: goalLang.nativeName })}
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setTermPinyin('');
                  }}
                />
                <MicButton
                  recording={recorder.state === 'recording' && micTarget === 'term'}
                  busy={transcribing && micTarget === 'term'}
                  onClick={() => onMicPress('term')}
                  label={t('vocab.speakWord')}
                />
              </div>
              {!!termPinyin && <div className="add-pinyin">{termPinyin}</div>}
              <div className="add-input-row">
                <input
                  className="field"
                  placeholder={t('vocab.translationPlaceholder', { lang: inputLang.nativeName })}
                  value={translation}
                  onChange={(e) => setTranslation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <MicButton
                  recording={recorder.state === 'recording' && micTarget === 'translation'}
                  busy={transcribing && micTarget === 'translation'}
                  onClick={() => onMicPress('translation')}
                  label={t('vocab.speakTranslation')}
                />
              </div>
              {oneSideFilled && (
                <button className="translate-btn" onClick={onTranslatePress} disabled={translating}>
                  {translating ? <span className="spinner" /> : <Sparkles size={16} />}
                  {t('vocab.translate')}
                </button>
              )}
              <button className="save-btn cyan" onClick={submit}>
                {t('common.save')}
              </button>
            </div>
          )}

          {shown.length === 0 ? (
            <div className="empty">
              <BookOpen size={52} className="faint" />
              <p>{t('vocab.emptyText', { lang: goalLang.nativeName })}</p>
            </div>
          ) : (
            <>
              <ListControls
                search={search}
                onSearch={setSearch}
                ordering={ordering}
                onOrdering={setOrdering}
                placeholder={t('vocab.searchPlaceholder')}
                latestLabel={t('phrase.latest')}
                byTagLabel={t('phrase.byTag')}
              />
              <TagFilterRow
                tags={recentTags(shown)}
                value={filterTags}
                onChange={setFilterTags}
                allLabel={t('common.all')}
              />

              {ordering === 'latest' ? (
                <div className="list">
                  {latest.length === 0 ? (
                    <p className="no-match">{t('phrase.noMatch')}</p>
                  ) : (
                    latest.map((item) => (
                      <VocabRow
                        key={item.id}
                        item={item}
                        onRemove={onRemove}
                        onGenerate={generateExample}
                        onOpen={(strokes) => setCard({ item, strokes })}
                        onLearn={() => setDrillId(item.id)}
                        t={t}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="list">
                  {sections.length === 0 ? (
                    <p className="no-match">{t('phrase.noMatch')}</p>
                  ) : (
                    sections.map((sec) => (
                      <div key={sec.title}>
                        <div className="section-header">
                          {sec.title} · {sec.data.length}
                        </div>
                        {sec.data.map((item) => (
                          <VocabRow
                            key={item.id}
                            item={item}
                            onRemove={onRemove}
                            onGenerate={generateExample}
                            onOpen={(strokes) => setCard({ item, strokes })}
                            onLearn={() => setDrillId(item.id)}
                            t={t}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      <BusyOverlay visible={!!scan.busy} label={scan.busy} onCancel={scan.cancel} />
      <Paywall
        visible={scan.showPaywall}
        onClose={scan.closePaywall}
        onUpgrade={() => {
          onPurchasePro();
          scan.closePaywall();
        }}
      />
    </div>
  );
}

function VocabRow({
  item,
  onRemove,
  onGenerate,
  onOpen,
  onLearn,
  t,
}: {
  item: VocabItem;
  onRemove: (id: string) => void;
  onGenerate: (item: VocabItem) => Promise<void>;
  onOpen: (strokes: boolean) => void;
  onLearn: () => void;
  t: TFn;
}) {
  const locale = speechLocale(findLanguage(item.lang));
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const canStrokes = usesHanzi(item.lang) && hasHanzi(item.term);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(
      [item.term, item.pinyin, item.translation].filter(Boolean).join(' — ')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function generate(e: React.MouseEvent) {
    e.stopPropagation();
    if (generating) return;
    setGenerating(true);
    try {
      await onGenerate(item);
    } catch (err: any) {
      window.alert(err?.message ?? String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Row onDelete={() => onRemove(item.id)} onTap={() => onOpen(false)} deleteLabel={t('swipe.delete')}>
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
        {/* Drilling one word is a main action, so it's a button on the row
            itself rather than something you have to hover to find. */}
        <button
          className="icon-outline alt"
          onClick={(e) => {
            e.stopPropagation();
            onLearn();
          }}
          aria-label={t('swipe.learn')}
          title={t('swipe.learn')}
        >
          <GraduationCap size={17} />
        </button>
        {canStrokes && (
          <button
            className="icon-outline"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(true);
            }}
            aria-label={t('vocab.strokes')}
            title={t('vocab.strokes')}
          >
            <Brush size={17} />
          </button>
        )}
        <button
          className="icon-soft"
          onClick={generate}
          disabled={generating}
          aria-label={t('vocab.genExample')}
          title={t('vocab.genExample')}
        >
          {generating ? <span className="spinner" /> : item.example ? <RefreshCw size={17} /> : <Sparkles size={17} />}
        </button>
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
    </Row>
  );
}
