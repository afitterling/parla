import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { LANGUAGES, Language } from '../languages';
import { useT } from '../i18n/I18nContext';

// Searchable, scrollable language picker shared by Settings and the Dialog bar.
// Needed because the learnable-language list is ~100 entries — far too many for
// the old wrap-grid / inline menu. Emits a language `code` to `onSelect`.
type Props = {
  visible: boolean;
  title: string;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  // Languages the learner already has content in. When given (and not
  // searching), they appear in an "Existing content" section on top and the
  // remaining languages follow under "All languages".
  priorityCodes?: string[];
};

// Flat rows for the FlatList: section headers mixed into the language rows.
type Row = { kind: 'header'; title: string } | { kind: 'lang'; lang: Language };

// Lowercase + strip diacritics so "espanol" matches "Español".
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function LanguagePicker({
  visible,
  title,
  selectedCode,
  onSelect,
  onClose,
  priorityCodes,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [query, setQuery] = useState('');

  const results = useMemo<Row[]>(() => {
    const q = fold(query.trim());
    if (q) {
      // Searching flattens the sections — match across the whole list.
      return LANGUAGES.filter(
        (l) =>
          fold(l.nativeName).includes(q) ||
          fold(l.label).includes(q) ||
          l.code.toLowerCase().includes(q)
      ).map((lang) => ({ kind: 'lang' as const, lang }));
    }
    const priority = (priorityCodes ?? [])
      .map((code) => LANGUAGES.find((l) => l.code === code))
      .filter((l): l is Language => !!l);
    if (priority.length === 0) return LANGUAGES.map((lang) => ({ kind: 'lang' as const, lang }));
    const inPriority = new Set(priority.map((l) => l.code));
    return [
      { kind: 'header' as const, title: t('langPicker.existing') },
      ...priority.map((lang) => ({ kind: 'lang' as const, lang })),
      { kind: 'header' as const, title: t('langPicker.all') },
      ...LANGUAGES.filter((l) => !inPriority.has(l.code)).map((lang) => ({
        kind: 'lang' as const,
        lang,
      })),
    ];
  }, [query, priorityCodes, t]);

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={close} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textFaint} />
              <TextInput
                style={styles.search}
                placeholder={t('langPicker.search')}
                placeholderTextColor={theme.colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>

            <FlatList
              data={results}
              keyExtractor={(row) => (row.kind === 'header' ? `header-${row.title}` : row.lang.code)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              initialNumToRender={20}
              ListEmptyComponent={<Text style={styles.noMatch}>{t('langPicker.noMatch')}</Text>}
              renderItem={({ item }) => {
                if (item.kind === 'header') {
                  return <Text style={styles.sectionHeader}>{item.title}</Text>;
                }
                const { lang } = item;
                const active = lang.code === selectedCode;
                return (
                  <Pressable
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      onSelect(lang.code);
                      close();
                    }}
                  >
                    <Text style={styles.flag}>{lang.flag}</Text>
                    <View style={styles.rowText}>
                      <Text style={[styles.native, active && styles.nativeActive]}>
                        {lang.nativeName}
                      </Text>
                      <Text style={styles.label}>{lang.label}</Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={theme.colors.accent} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
    kav: { maxHeight: '85%' },
    card: {
      backgroundColor: theme.colors.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.bgElevated,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    search: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    },
    list: { paddingBottom: 8 },
    sectionHeader: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: 8,
      paddingTop: 14,
      paddingBottom: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
      paddingHorizontal: 8,
      borderRadius: theme.radius.sm,
    },
    rowActive: { backgroundColor: theme.colors.accentDim },
    flag: { fontSize: 24 },
    rowText: { flex: 1 },
    native: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
    nativeActive: { color: theme.colors.accent },
    label: { color: theme.colors.textFaint, fontSize: 12, marginTop: 1 },
    noMatch: { color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 28, fontSize: 14 },
  });
}
