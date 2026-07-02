import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { Settings, VocabItem } from '../storage';
import { ExportFormat, exportVocab } from '../export';
import { generateVocabExample } from '../api';
import { findLanguage, speechLocale } from '../languages';
import { SwipeRow } from '../components/SwipeRow';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges, TagModal } from '../components/TagModal';
import { useT } from '../i18n/I18nContext';
import { TFn } from '../i18n';

type Props = {
  vocab: VocabItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onAdd: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags'>[]) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  tagSuggestions: string[];
};

export function VocabScreen({ vocab, settings, onRemove, onAdd, onUpdate, tagSuggestions }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Only vocab in the currently selected goal language.
  const shown = vocab.filter((v) => v.lang === settings.goalLanguage);

  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  // Example gets a transliteration line only when the goal language uses one and
  // the learner has Pinyin/Romaji turned on (same rule as the dialogue).
  const wantPinyin = !!goalLang.romanize && settings.showPinyin;

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

  function submit() {
    if (!term.trim()) return;
    onAdd([{ term: term.trim(), translation: translation.trim(), lang: settings.goalLanguage }]);
    setTerm('');
    setTranslation('');
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
        <View style={styles.headerRight}>
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
            <Text style={styles.addToggleText}>{adding ? t('common.cancel') : t('common.new')}</Text>
          </Pressable>
        </View>
      </View>

      {adding && (
        <View style={styles.addCard}>
          <TextInput
            style={styles.input}
            placeholder={t('vocab.wordPlaceholder', {
              lang: findLanguage(settings.goalLanguage).nativeName,
            })}
            placeholderTextColor={theme.colors.textFaint}
            value={term}
            onChangeText={setTerm}
            autoFocus
          />
          <TextInput
            style={styles.input}
            placeholder={t('vocab.translationPlaceholder', {
              lang: findLanguage(settings.inputLanguage).nativeName,
            })}
            placeholderTextColor={theme.colors.textFaint}
            value={translation}
            onChangeText={setTranslation}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
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
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Row
              item={item}
              onRemove={onRemove}
              onUpdate={onUpdate}
              onGenerate={generateExample}
              tagSuggestions={tagSuggestions}
              t={t}
            />
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Row({
  item,
  onRemove,
  onUpdate,
  onGenerate,
  tagSuggestions,
  t,
}: {
  item: VocabItem;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<VocabItem>) => void;
  onGenerate: (item: VocabItem) => Promise<void>;
  tagSuggestions: string[];
  t: TFn;
}) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const locale = speechLocale(findLanguage(item.lang));
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

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
      onTap={() => setTagModalOpen(true)}
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
  delBtn: { paddingLeft: 12 },
  delText: { fontSize: 18 },
  });
}
