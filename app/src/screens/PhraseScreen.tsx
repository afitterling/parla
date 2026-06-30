import { useEffect, useMemo, useState } from 'react';
import {
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
import { theme } from '../theme';
import { PhraseItem, Settings, recentTags } from '../storage';
import { ExportFormat, exportPhrases } from '../export';
import { findLanguage, speechLocale } from '../languages';
import { SwipeRow } from '../components/SwipeRow';
import { SpeakButton } from '../components/SpeakButton';
import { TagBadges, TagModal } from '../components/TagModal';
import { useT } from '../i18n/I18nContext';

type Props = {
  phrases: PhraseItem[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
};

type View2 = 'list' | 'train';

export function PhraseScreen({
  phrases,
  onRemove,
  onUpdate,
  settings,
}: Props & { settings: Settings }) {
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

  async function runExport(format: ExportFormat) {
    try {
      await exportPhrases(shown, settings.goalLanguage, format, t('export.title'));
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
      <View style={styles.topRow}>
        <View style={styles.langBadge}>
          <Ionicons name="language-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.langBadgeText}>{findLanguage(settings.goalLanguage).nativeName}</Text>
        </View>
        <Text style={styles.topCount}>
          {shown.length} {shown.length === 1 ? t('phrase.one') : t('phrase.many')}
        </Text>
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
      </View>

      <View style={styles.segment}>
        <Seg
          icon="list-outline"
          label={t('phrase.list')}
          active={view === 'list'}
          onPress={() => setView('list')}
        />
        <Seg
          icon="school-outline"
          label={t('phrase.training')}
          active={view === 'train'}
          onPress={() => {
            setLearnPhrase(null);
            setView('train');
          }}
        />
      </View>

      {view === 'list' ? (
        <ListView
          phrases={shown}
          onRemove={onRemove}
          onUpdate={onUpdate}
          tagSuggestions={tags}
          onLearn={startLearn}
        />
      ) : (
        <TrainView
          phrases={shown}
          onUpdate={onUpdate}
          tagSuggestions={tags}
          learnPhrase={learnPhrase}
          onClearLearn={() => setLearnPhrase(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ── List / Lookup ────────────────────────────────────────────────────────────
function ListView({
  phrases,
  onRemove,
  onUpdate,
  tagSuggestions,
  onLearn,
}: Props & { onLearn: (item: PhraseItem) => void }) {
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
        p.tags.some((t) => t.toLowerCase().includes(q));
      const matchTag =
        !filterTag || p.tags.some((t) => t.toLowerCase() === filterTag.toLowerCase());
      return matchSearch && matchTag;
    });
  }, [phrases, search, filterTag]);

  const latest = useMemo(
    () => [...filtered].sort((a, b) => b.createdAt - a.createdAt),
    [filtered]
  );

  const sections = useMemo(() => {
    const tagSet = new Set<string>();
    filtered.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
    let tagList = [...tagSet].sort((a, b) => a.localeCompare(b));
    if (filterTag) tagList = tagList.filter((t) => t.toLowerCase() === filterTag.toLowerCase());
    const secs = tagList.map((tag) => ({
      title: tag,
      data: filtered
        .filter((p) => p.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
        .sort((a, b) => b.createdAt - a.createdAt),
    }));
    if (!filterTag) {
      const untagged = filtered
        .filter((p) => p.tags.length === 0)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (untagged.length) secs.push({ title: t('phrase.untagged'), data: untagged });
    }
    return secs;
  }, [filtered, filterTag]);

  if (phrases.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="bookmark-outline" size={52} color={theme.colors.textFaint} />
        <Text style={styles.emptyText}>{t('phrase.emptyText')}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          placeholder={t('phrase.searchPlaceholder')}
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

      <TagFilterRow tags={tagSuggestions} value={filterTag} onChange={setFilterTag} />

      {ordering === 'latest' ? (
        <FlatList
          data={latest}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PhraseRow
              item={item}
              onRemove={onRemove}
              onUpdate={onUpdate}
              tagSuggestions={tagSuggestions}
              onLearn={onLearn}
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
            <PhraseRow
              item={item}
              onRemove={onRemove}
              onUpdate={onUpdate}
              tagSuggestions={tagSuggestions}
              onLearn={onLearn}
            />
          )}
          ListEmptyComponent={<Text style={styles.noMatch}>{t('phrase.noMatch')}</Text>}
        />
      )}
    </View>
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
    <SwipeRow
      onDelete={() => onRemove(item.id)}
      onLearn={() => onLearn(item)}
      onTap={() => setTagModalOpen(true)}
      deleteLabel={t('swipe.delete')}
      learnLabel={t('swipe.learn')}
    >
      <View style={styles.row}>
        <SpeakButton
          text={item.target}
          locale={speechLocale(findLanguage(item.lang))}
          style={styles.speakBtn}
        />
        <Text style={[styles.target, styles.targetWithSpeak]}>{item.target}</Text>
        {!!item.pinyin && <Text style={styles.pinyin}>{item.pinyin}</Text>}
        {!!item.translation && <Text style={styles.trans}>{item.translation}</Text>}

        <TagBadges tags={item.tags} />

        {item.reviews > 0 && (
          <Text style={[styles.stat, styles.statRow]}>
            {t('phrase.known', { known: item.known, reviews: item.reviews })}
          </Text>
        )}

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
      </View>
    </SwipeRow>
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
        (p) => !sessionTag || p.tags.some((t) => t.toLowerCase() === sessionTag.toLowerCase())
      ),
    [phrases, sessionTag]
  );

  // Single-phrase "Lernen" flow: start a one-card session immediately,
  // showing the original target phrase first, bypassing the setup screen.
  useEffect(() => {
    if (learnPhrase) {
      setDirection('t2de');
      setQueue([learnPhrase.id]);
      setTotal(1);
      setRevealed(false);
    }
  }, [learnPhrase]);

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
      <View style={{ flex: 1 }}>
        <Text style={styles.trainHint}>{t('train.direction')}</Text>
        <View style={[styles.orderToggle, styles.trainBlock]}>
          <Pressable
            style={[styles.orderBtn, direction === 'de2t' && styles.orderBtnActive]}
            onPress={() => setDirection('de2t')}
          >
            <Text style={[styles.orderText, direction === 'de2t' && styles.orderTextActive]}>
              {t('train.de2t')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.orderBtn, direction === 't2de' && styles.orderBtnActive]}
            onPress={() => setDirection('t2de')}
          >
            <Text style={[styles.orderText, direction === 't2de' && styles.orderTextActive]}>
              {t('train.t2de')}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.trainHint}>{t('train.whichPhrases')}</Text>
        <TagFilterRow tags={tagSuggestions} value={sessionTag} onChange={setSessionTag} />

        <View style={styles.trainCenter}>
          <Text style={styles.poolCount}>
            {pool.length} {pool.length === 1 ? t('phrase.one') : t('phrase.many')}
            {sessionTag ? t('train.withTag', { tag: sessionTag }) : ''}
          </Text>
          <Pressable
            style={[styles.bigBtn, pool.length === 0 && styles.bigBtnDisabled]}
            disabled={pool.length === 0}
            onPress={start}
          >
            <Text style={styles.bigBtnText}>{t('train.start')}</Text>
          </Pressable>
          {pool.length === 0 && (
            <Text style={styles.noMatch}>
              {sessionTag ? t('train.noPhrasesInTag') : t('train.noPhrases')}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Done screen
  if (queue.length === 0) {
    return (
      <View style={styles.trainCenter}>
        <Ionicons name="trophy-outline" size={52} color={theme.colors.accent} />
        <Text style={styles.doneTitle}>{t('train.doneTitle', { total })}</Text>
        <Pressable style={styles.bigBtn} onPress={start}>
          <Text style={styles.bigBtnText}>{t('train.again')}</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={reset}>
          <Text style={styles.linkBtnText}>{t('train.changeSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  const current = phrases.find((p) => p.id === queue[0]);
  if (!current) {
    // Phrase vanished (e.g. deleted elsewhere) — drop it and continue.
    setQueue((q) => (q ? q.slice(1) : q));
    return null;
  }

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
    <View style={{ flex: 1 }}>
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {done}/{total}
        </Text>
        <Text style={styles.progressDir}>
          {direction === 'de2t' ? t('train.de2t') : t('train.t2de')}
        </Text>
        <Pressable onPress={reset} hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <Pressable style={styles.card} onPress={() => !revealed && setRevealed(true)}>
        <Text style={styles.cardSide}>
          {direction === 'de2t' ? t('train.native') : t('train.targetLang')}
        </Text>
        <Text style={styles.cardFront}>{frontText}</Text>
        {direction === 't2de' && !!current.pinyin && (
          <Text style={styles.cardPinyin}>{current.pinyin}</Text>
        )}
        {revealed ? (
          <>
            <View style={styles.cardDivider} />
            <Text style={styles.cardBack}>{backText}</Text>
            {direction === 'de2t' && !!current.pinyin && (
              <Text style={styles.cardPinyin}>{current.pinyin}</Text>
            )}
            <TagBadges tags={current.tags} />
          </>
        ) : (
          <Text style={styles.cardTapHint}>{t('train.tapToReveal')}</Text>
        )}
      </Pressable>

      {revealed ? (
        <View style={styles.answerRow}>
          <Pressable style={[styles.answerBtn, styles.againBtn]} onPress={again}>
            <Ionicons name="refresh" size={17} color={theme.colors.textMuted} />
            <Text style={styles.againText}>{t('train.againBtn')}</Text>
          </Pressable>
          <Pressable style={[styles.answerBtn, styles.knownBtn]} onPress={known}>
            <Ionicons name="checkmark" size={17} color="#04210f" />
            <Text style={styles.knownText}>{t('train.knownBtn')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.revealBtn} onPress={() => setRevealed(true)}>
          <Text style={styles.revealText}>{t('train.reveal')}</Text>
        </Pressable>
      )}
    </View>
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
    <View style={styles.filterRow}>
      <Pressable
        style={[styles.filterChip, value === null && styles.filterChipOn]}
        onPress={() => onChange(null)}
      >
        <Text style={[styles.filterChipText, value === null && styles.filterChipTextOn]}>
          {t('common.all')}
        </Text>
      </Pressable>
      {tags.map((tag) => {
        const on = value?.toLowerCase() === tag.toLowerCase();
        return (
          <Pressable
            key={tag}
            style={[styles.filterChip, on && styles.filterChipOn]}
            onPress={() => onChange(on ? null : tag)}
          >
            <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{tag}</Text>
          </Pressable>
        );
      })}
    </View>
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
  return (
    <Pressable style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? '#fff' : theme.colors.textMuted} />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
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
  topCount: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },
  exportBtn: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentDim,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    padding: 3,
    marginHorizontal: 16,
    marginBottom: 10,
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

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: theme.colors.bgElevated,
  },
  filterChipOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentDim },
  filterChipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  filterChipTextOn: { color: theme.colors.text },

  list: { padding: 16, gap: 10 },
  sectionHeader: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  noMatch: { color: theme.colors.textFaint, fontSize: 14, textAlign: 'center', padding: 24 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 20 },

  row: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 14,
  },
  speakBtn: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  target: { color: theme.colors.text, fontSize: 18, fontWeight: '700', lineHeight: 25 },
  targetWithSpeak: { paddingRight: 44 },
  pinyin: { color: theme.colors.accent2, fontSize: 13, marginTop: 2, fontWeight: '500' },
  trans: { color: theme.colors.textMuted, fontSize: 14, marginTop: 3 },

  stat: { color: theme.colors.textFaint, fontSize: 12 },
  statRow: { marginTop: 10 },

  // training
  trainHint: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  trainBlock: { marginHorizontal: 16 },
  trainCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  poolCount: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  bigBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: theme.radius.pill,
  },
  bigBtnDisabled: { opacity: 0.4 },
  bigBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkBtn: { paddingVertical: 6 },
  linkBtnText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  doneTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  progressText: { color: theme.colors.accent, fontSize: 16, fontWeight: '800' },
  progressDir: { color: theme.colors.textFaint, fontSize: 12, flex: 1 },
  progressStop: { color: theme.colors.textMuted, fontSize: 18, fontWeight: '700' },

  card: {
    flex: 1,
    margin: 16,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSide: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  cardFront: { color: theme.colors.text, fontSize: 28, fontWeight: '700', textAlign: 'center', lineHeight: 38 },
  cardDivider: {
    width: 60,
    height: 2,
    backgroundColor: theme.colors.accent,
    borderRadius: 1,
    marginVertical: 20,
  },
  cardBack: { color: theme.colors.accent, fontSize: 26, fontWeight: '700', textAlign: 'center', lineHeight: 36 },
  cardPinyin: {
    color: theme.colors.accent2,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
  cardTapHint: { color: theme.colors.textFaint, fontSize: 13, marginTop: 24 },

  answerRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  answerBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
  },
  againBtn: { backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.cardBorder },
  againText: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 15 },
  knownBtn: { backgroundColor: theme.colors.success },
  knownText: { color: '#04210f', fontWeight: '800', fontSize: 15 },
  revealBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: theme.colors.accent,
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
  },
  revealText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
