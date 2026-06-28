import { useState } from 'react';
import {
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
import { theme } from '../theme';
import { Settings, VocabItem } from '../storage';
import { findLanguage } from '../languages';
import { SwipeRow } from '../components/SwipeRow';
import { useT } from '../i18n/I18nContext';
import { TFn } from '../i18n';

type Props = {
  vocab: VocabItem[];
  settings: Settings;
  onRemove: (id: string) => void;
  onAdd: (items: Omit<VocabItem, 'id' | 'createdAt'>[]) => void;
};

export function VocabScreen({ vocab, settings, onRemove, onAdd }: Props) {
  const t = useT();
  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const [adding, setAdding] = useState(false);

  // Only vocab in the currently selected goal language.
  const shown = vocab.filter((v) => v.lang === settings.goalLanguage);

  function submit() {
    if (!term.trim()) return;
    onAdd([{ term: term.trim(), translation: translation.trim(), lang: settings.goalLanguage }]);
    setTerm('');
    setTranslation('');
    setAdding(false);
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
        <Pressable style={styles.addToggle} onPress={() => setAdding((v) => !v)}>
          <Ionicons name={adding ? 'close' : 'add'} size={15} color="#fff" />
          <Text style={styles.addToggleText}>{adding ? t('common.cancel') : t('common.new')}</Text>
        </Pressable>
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
          renderItem={({ item }) => <Row item={item} onRemove={onRemove} t={t} />}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Row({ item, onRemove, t }: { item: VocabItem; onRemove: (id: string) => void; t: TFn }) {
  return (
    <SwipeRow onDelete={() => onRemove(item.id)} deleteLabel={t('swipe.delete')}>
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.term}>{item.term}</Text>
          {!!item.pinyin && <Text style={styles.pinyin}>{item.pinyin}</Text>}
          {!!item.translation && <Text style={styles.trans}>{item.translation}</Text>}
          {!!item.example && <Text style={styles.example}>„{item.example}"</Text>}
        </View>
      </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
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
  example: { color: theme.colors.textFaint, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  delBtn: { paddingLeft: 12 },
  delText: { fontSize: 18 },
});
