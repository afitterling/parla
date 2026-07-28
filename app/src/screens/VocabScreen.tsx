import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { isPaywallActive, recentTags, Settings, VocabItem } from '../storage';
import { ExportFormat, exportVocab } from '../export';
import { generateVocabExample, scanImageForVocab, transcribeAudio, translateVocabTerm } from '../api';
import { findLanguage, speechLocale, usesHanzi } from '../languages';
import { useRecorder } from '../useRecorder';
import { useScanFlow } from '../useScanFlow';
import { BusyOverlay } from '../components/BusyOverlay';
import { Paywall } from '../components/Paywall';
import { SwipeRow } from '../components/SwipeRow';
import { MicButton } from '../components/MicButton';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges } from '../components/TagModal';
import { TagFilterRow, useTaggedList } from '../components/TaggedList';
import { WordCard } from '../components/WordCard';
import { hasHanzi } from '../strokes';
import { QuizItem, TypeQuiz } from '../components/TypeQuiz';
import { useT } from '../i18n/I18nContext';
import { TFn } from '../i18n';

type Props = {
  vocab: VocabItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onAdd: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  tagSuggestions: string[];
  onPurchasePro: () => void;
};

export function VocabScreen({
  vocab,
  settings,
  onRemove,
  onAdd,
  onUpdate,
  tagSuggestions,
  onPurchasePro,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
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
  // Which of the two add-card fields the mic is currently recording for.
  const [micTarget, setMicTarget] = useState<'term' | 'translation'>('term');
  const [translating, setTranslating] = useState(false);

  // Only vocab in the currently selected goal language.
  const shown = vocab.filter((v) => v.lang === settings.goalLanguage);

  // Search + tag-filter + group-by-tag over the shown words (shared with Phrases).
  const { search, setSearch, ordering, setOrdering, filterTags, setFilterTags, latest, sections } =
    useTaggedList(
      shown,
      (v) => `${v.term} ${v.pinyin ?? ''} ${v.translation} ${v.tags.join(' ')}`.toLowerCase(),
      t('phrase.untagged')
    );

  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);

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
  // Generate the reading whenever the goal language has one; showing it is a
  // separate, display-only setting (see the dialogue's "Aa" toggle).
  const wantPinyin = !!goalLang.romanize;

  // Payment-gated: photograph text (a page, sign, menu …) and turn it into
  // dictionary entries. Non-Pro Release builds hit the paywall; the local dev
  // build is exempt (isPaywallActive).
  const scan = useScanFlow({
    paywallActive: isPaywallActive(settings.isPro),
    extract: (base64, signal) =>
      scanImageForVocab(settings.openaiKey, base64, goalLang, inputLang, wantPinyin, signal),
    add: (items) =>
      onAdd(
        items.map((v) => ({
          term: v.term,
          translation: v.translation,
          pinyin: v.pinyin,
          lang: settings.goalLanguage,
        }))
      ),
    labels: {
      menuTitle: t('scan.vocabTitle'),
      camera: t('scan.camera'),
      library: t('scan.library'),
      cancel: t('common.cancel'),
      reading: t('scan.reading'),
      none: t('scan.none'),
      added: (count) => t('scan.addedVocab', { count: String(count) }),
      permission: t('scan.permission'),
    },
  });

  // A word still needs enrichment if it lacks an example, a translation for that
  // example, or — when the goal language is transliterated — the word's own
  // pinyin or the example's pinyin. This is what "fill all missing" targets.
  function needsEnrich(v: VocabItem): boolean {
    if (!v.example || !v.exampleTranslation) return true;
    if (wantPinyin && (!v.pinyin || !v.examplePinyin)) return true;
    return false;
  }

  // Generate a natural example sentence (+ pinyin + translation) for one word and
  // persist it, also filling the word's own pinyin if it was missing. Throws on
  // error so callers can surface it.
  async function generateExample(item: VocabItem) {
    const res = await generateVocabExample(
      settings.openaiKey,
      item.term,
      goalLang,
      inputLang,
      wantPinyin
    );
    onUpdate(item.id, {
      // Keep an existing word pinyin; only backfill when it was missing.
      pinyin: item.pinyin || res.termPinyin,
      example: res.example,
      examplePinyin: res.examplePinyin,
      exampleTranslation: res.exampleTranslation,
    });
  }

  // Fill in / complete example sentences for every shown word that still needs it.
  async function generateAllMissing() {
    const missing = shown.filter(needsEnrich);
    if (missing.length === 0) return;
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
    if (failed > 0) {
      Alert.alert(t('vocab.genExample'), t('vocab.genFailed', { count: String(failed) }));
    }
  }

  function promptGenerateAll() {
    const missing = shown.filter(needsEnrich).length;
    if (missing === 0) return;
    Alert.alert(t('vocab.genExample'), t('vocab.genAllConfirm', { count: String(missing) }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), onPress: generateAllMissing },
    ]);
  }

  // Speak instead of typing: tap to record, tap again to stop and transcribe
  // with Whisper, then drop the text into the field (still editable before
  // saving). Works for both fields — the term records in the goal language,
  // the translation in the input language.
  async function onMicPress(target: 'term' | 'translation') {
    // A tap on the *other* mic while recording just stops the running one, so
    // errors are attributed to the field the recording was started for.
    const active = recorder.state === 'recording' ? micTarget : target;
    const title = active === 'term' ? t('vocab.speakWord') : t('vocab.speakTranslation');
    if (recorder.state === 'recording') {
      try {
        setTranscribing(true);
        const uri = await recorder.stop();
        if (uri) {
          const lang = micTarget === 'term' ? goalLang : inputLang;
          const text = await transcribeAudio(uri, settings.openaiKey, lang);
          // Whisper punctuates like a sentence — strip that for a vocab entry.
          const cleaned = text.replace(/[。．.．!！?？,，、;；]+$/gu, '').trim();
          if (!cleaned) Alert.alert(title, t('dialog.errorNoSpeech'));
          else if (micTarget === 'term') {
            setTerm(cleaned);
            setTermPinyin('');
          } else setTranslation(cleaned);
        }
      } catch (e: any) {
        Alert.alert(title, e?.message ?? String(e));
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        setMicTarget(target);
        await recorder.start();
      } catch (e: any) {
        Alert.alert(title, e?.message ?? t('dialog.errorRecording'));
      }
    }
  }

  // Fill the empty half of the pair from the filled one. Direction is inferred:
  // only the term → translate into the input language; only the translation →
  // translate into the goal language (incl. the reading, so the word is saved
  // complete). The button is only enabled when exactly one side is filled.
  async function onTranslatePress() {
    if (translating) return;
    const haveTerm = !!term.trim();
    const haveTranslation = !!translation.trim();
    if (haveTerm === haveTranslation) return;
    setTranslating(true);
    try {
      if (haveTerm) {
        const res = await translateVocabTerm(
          settings.openaiKey,
          term.trim(),
          goalLang,
          inputLang,
          false
        );
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
      Alert.alert(t('vocab.translate'), e?.message ?? String(e));
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

  async function runExport(format: ExportFormat) {
    try {
      await exportVocab(shown, settings.goalLanguage, format, t('export.title'));
    } catch (e: any) {
      Alert.alert(t('export.title'), e?.message ?? String(e));
    }
  }

  function promptExport() {
    if (shown.length === 0) return;
    Alert.alert(t('export.title'), t('export.choose'), [
      { text: t('export.csv'), onPress: () => runExport('csv') },
      { text: t('export.json'), onPress: () => runExport('json') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.langBadge}>
            <Ionicons name="language-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.langBadgeText}>{findLanguage(settings.goalLanguage).nativeName}</Text>
          </View>
          <Text style={styles.count}>
            {shown.length} {shown.length === 1 ? t('vocab.one') : t('vocab.many')}
          </Text>
        </View>
        {mode === 'list' && (
          <View style={styles.headerRight}>
            <Pressable
              style={styles.exportBtn}
              onPress={scan.open}
              hitSlop={8}
              accessibilityLabel={t('scan.vocabTitle')}
            >
              <Ionicons name="scan-outline" size={18} color={theme.colors.accent} />
            </Pressable>
            {shown.some(needsEnrich) && (
              <Pressable
                style={styles.exportBtn}
                onPress={promptGenerateAll}
                disabled={bulkBusy}
                hitSlop={8}
                accessibilityLabel={t('vocab.genExample')}
              >
                {bulkBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
                )}
              </Pressable>
            )}
            {shown.length > 0 && (
              <Pressable
                style={styles.exportBtn}
                onPress={promptExport}
                hitSlop={8}
                accessibilityLabel={t('export.title')}
              >
                <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
              </Pressable>
            )}
            <Pressable style={styles.addToggle} onPress={() => setAdding((v) => !v)}>
              <Ionicons name={adding ? 'close' : 'add'} size={15} color="#fff" />
              <Text style={styles.addToggleText}>
                {adding ? t('common.cancel') : t('common.new')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.segment}>
        <Seg
          icon="book-outline"
          label={t('tab.vocab')}
          active={mode === 'list'}
          onPress={() => setMode('list')}
        />
        <Seg
          icon="create-outline"
          label={t('quiz.tab')}
          active={mode === 'quiz'}
          onPress={() => {
            setAdding(false);
            setMode('quiz');
          }}
        />
      </View>

      {mode === 'quiz' ? (
        <TypeQuiz
          items={quizItems}
          romanized={!!goalLang.romanize}
          answerLangName={goalLang.nativeName}
          locale={speechLocale(goalLang)}
          tagSuggestions={tagSuggestions}
          scope="vocab"
          onResult={(id, correct) => {
            // Remember what's been learned so the next session can skip it.
            const v = shown.find((x) => x.id === id);
            if (!v) return;
            onUpdate(id, {
              reviews: (v.reviews ?? 0) + 1,
              known: (v.known ?? 0) + (correct ? 1 : 0),
            });
          }}
        />
      ) : (
        <>
      {adding && (
        <View style={styles.addCard}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              placeholder={t('vocab.wordPlaceholder', {
                lang: findLanguage(settings.goalLanguage).nativeName,
              })}
              placeholderTextColor={theme.colors.textFaint}
              value={term}
              onChangeText={(v) => {
                setTerm(v);
                // Hand-editing the term invalidates a reading that came from
                // auto-translate.
                setTermPinyin('');
              }}
              autoFocus
            />
            <MicButton
              recording={recorder.state === 'recording' && micTarget === 'term'}
              busy={transcribing && micTarget === 'term'}
              onPress={() => onMicPress('term')}
              label={t('vocab.speakWord')}
            />
          </View>
          {!!termPinyin && <Text style={styles.addPinyin}>{termPinyin}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              placeholder={t('vocab.translationPlaceholder', {
                lang: findLanguage(settings.inputLanguage).nativeName,
              })}
              placeholderTextColor={theme.colors.textFaint}
              value={translation}
              onChangeText={setTranslation}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            <MicButton
              recording={recorder.state === 'recording' && micTarget === 'translation'}
              busy={transcribing && micTarget === 'translation'}
              onPress={() => onMicPress('translation')}
              label={t('vocab.speakTranslation')}
            />
          </View>
          {/* Enabled only when exactly one side is filled — it fills the other. */}
          {!!term.trim() !== !!translation.trim() && (
            <Pressable
              style={styles.translateBtn}
              onPress={onTranslatePress}
              disabled={translating}
              accessibilityLabel={t('vocab.translate')}
            >
              {translating ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.translateBtnText}>{t('vocab.translate')}</Text>
                </>
              )}
            </Pressable>
          )}
          <Pressable style={styles.saveBtn} onPress={submit}>
            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          </Pressable>
        </View>
      )}

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={52} color={theme.colors.textFaint} />
          <Text style={styles.emptyText}>
            {t('vocab.emptyText', { lang: findLanguage(settings.goalLanguage).nativeName })}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.controls}>
            <TextInput
              style={styles.search}
              placeholder={t('vocab.searchPlaceholder')}
              placeholderTextColor={theme.colors.textFaint}
              value={search}
              onChangeText={setSearch}
            />
            <View style={styles.orderToggle}>
              <Pressable
                style={[styles.orderBtn, ordering === 'latest' && styles.orderBtnActive]}
                onPress={() => setOrdering('latest')}
              >
                <Text style={[styles.orderText, ordering === 'latest' && styles.orderTextActive]}>
                  {t('phrase.latest')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.orderBtn, ordering === 'tag' && styles.orderBtnActive]}
                onPress={() => setOrdering('tag')}
              >
                <Text style={[styles.orderText, ordering === 'tag' && styles.orderTextActive]}>
                  {t('phrase.byTag')}
                </Text>
              </Pressable>
            </View>
          </View>

          <TagFilterRow
            tags={recentTags(shown)}
            value={filterTags}
            onChange={setFilterTags}
            allLabel={t('common.all')}
          />

          {ordering === 'latest' ? (
            <FlatList
              data={latest}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Row
                  item={item}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                  onGenerate={generateExample}
                  tagSuggestions={tagSuggestions}
                  openaiKey={settings.openaiKey}
                  t={t}
                />
              )}
              ListEmptyComponent={<Text style={styles.noMatch}>{t('phrase.noMatch')}</Text>}
            />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>
                  {section.title}  ·  {section.data.length}
                </Text>
              )}
              renderItem={({ item }) => (
                <Row
                  item={item}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                  onGenerate={generateExample}
                  tagSuggestions={tagSuggestions}
                  openaiKey={settings.openaiKey}
                  t={t}
                />
              )}
              ListEmptyComponent={<Text style={styles.noMatch}>{t('phrase.noMatch')}</Text>}
            />
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
    </KeyboardAvoidingView>
  );
}

function Seg({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? '#fff' : theme.colors.textMuted} />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Row({
  item,
  onRemove,
  onUpdate,
  onGenerate,
  tagSuggestions,
  openaiKey,
  t,
}: {
  item: VocabItem;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  onGenerate: (item: VocabItem) => Promise<void>;
  tagSuggestions: string[];
  openaiKey: string;
  t: TFn;
}) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const locale = speechLocale(findLanguage(item.lang));
  // The card opens either on the word side (tap) or straight into stroke
  // practice (the outline brush button).
  const [cardOpen, setCardOpen] = useState(false);
  const [cardStrokes, setCardStrokes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Stroke practice only for the Han-script languages (Chinese, Japanese kanji).
  const canStrokes = usesHanzi(item.lang) && hasHanzi(item.term);

  function openCard(strokes: boolean) {
    setCardStrokes(strokes);
    setCardOpen(true);
  }

  async function copy() {
    await Clipboard.setStringAsync(
      [item.term, item.pinyin, item.translation].filter(Boolean).join(' — ')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    try {
      await onGenerate(item);
    } catch (e: any) {
      Alert.alert(t('vocab.genExample'), e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SwipeRow
      onDelete={() => onRemove(item.id)}
      onTap={() => openCard(false)}
      deleteLabel={t('swipe.delete')}
    >
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.term}>{item.term}</Text>
          {!!item.pinyin && <Text style={styles.pinyin}>{item.pinyin}</Text>}
          {!!item.translation && <Text style={styles.trans}>{item.translation}</Text>}
          {!!item.example && (
            <View style={styles.exampleBlock}>
              <Text style={styles.example}>„{item.example}"</Text>
              {!!item.examplePinyin && (
                <Text style={styles.examplePinyin}>{item.examplePinyin}</Text>
              )}
              {!!item.exampleTranslation && (
                <Text style={styles.exampleTrans}>{item.exampleTranslation}</Text>
              )}
            </View>
          )}
          <TagBadges tags={item.tags} />
        </View>
        {canStrokes && (
          <Pressable
            style={styles.outlineBtn}
            onPress={() => openCard(true)}
            hitSlop={8}
            accessibilityLabel={t('vocab.strokes')}
          >
            <Ionicons name="brush-outline" size={18} color={theme.colors.accent} />
          </Pressable>
        )}
        <Pressable
          style={styles.copyBtn}
          onPress={generate}
          disabled={generating}
          hitSlop={8}
          accessibilityLabel={t('vocab.genExample')}
        >
          {generating ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Ionicons
              name={item.example ? 'refresh-outline' : 'sparkles-outline'}
              size={18}
              color={theme.colors.accent}
            />
          )}
        </Pressable>
        <Pressable
          style={styles.copyBtn}
          onPress={copy}
          hitSlop={8}
          accessibilityLabel={t('vocab.copy')}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={18}
            color={copied ? theme.colors.accent2 : theme.colors.textFaint}
          />
        </Pressable>
        <SpeakButton
          text={item.example ? `${item.term}. ${item.example}` : item.term}
          locale={locale}
          style={{ marginLeft: 6 }}
        />
      </View>

      <WordCard
        visible={cardOpen}
        item={item}
        suggestions={tagSuggestions}
        initialStrokes={cardStrokes}
        openaiKey={openaiKey}
        onChange={(tags) => onUpdate(item.id, { tags })}
        onFillPinyin={(pinyin) => onUpdate(item.id, { pinyin })}
        onClose={() => setCardOpen(false)}
      />
    </SwipeRow>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  container: { flex: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.accentDim,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  langBadgeText: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  count: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentDim,
  },
  addToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addToggleText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    padding: 3,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  segTextActive: { color: '#fff' },
  addCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  input: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: theme.colors.text,
    fontSize: 15,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  // Reading of an auto-translated term, previewed before saving.
  addPinyin: { color: theme.colors.accent2, fontSize: 13, marginTop: -4, paddingLeft: 4 },
  translateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingVertical: 11,
  },
  translateBtnText: { color: theme.colors.accent, fontWeight: '700', fontSize: 14 },
  saveBtn: {
    backgroundColor: theme.colors.accent2,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#001b1f', fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 20 },

  controls: { paddingHorizontal: 16, gap: 10 },
  search: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    color: theme.colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  orderToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    padding: 3,
  },
  orderBtn: { flex: 1, paddingVertical: 8, borderRadius: theme.radius.pill, alignItems: 'center' },
  orderBtnActive: { backgroundColor: theme.colors.accent2 },
  orderText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  orderTextActive: { color: '#001b1f' },
  sectionHeader: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  noMatch: { color: theme.colors.textFaint, fontSize: 14, textAlign: 'center', padding: 24 },

  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 14,
  },
  rowMain: { flex: 1 },
  term: { color: theme.colors.text, fontSize: 17, fontWeight: '700' },
  pinyin: { color: theme.colors.accent2, fontSize: 13, marginTop: 2 },
  trans: { color: theme.colors.textMuted, fontSize: 14, marginTop: 2 },
  exampleBlock: { marginTop: 4 },
  example: { color: theme.colors.textFaint, fontSize: 13, fontStyle: 'italic' },
  examplePinyin: { color: theme.colors.accent2, fontSize: 12, marginTop: 1 },
  exampleTrans: { color: theme.colors.textMuted, fontSize: 12, marginTop: 1, fontStyle: 'italic' },
  copyBtn: {
    marginLeft: 10,
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  // Outline (hollow) variant of the round row button — used for stroke order.
  outlineBtn: {
    marginLeft: 10,
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: 'transparent',
  },
  delBtn: { paddingLeft: 12 },
  delText: { fontSize: 18 },
  });
}
