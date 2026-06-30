import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';

// A tap-to-edit tag picker shared by the Phrase and Vocab rows: toggleable
// suggestion chips plus a free-text "add tag" field. Assigning is immediate;
// removing an already-assigned tag asks for confirmation. The caller owns the
// tag list and receives the full next list via `onChange`.
type TagModalProps = {
  visible: boolean;
  title: string; // header (e.g. "Tags")
  subtitle: string; // the term / phrase being tagged
  addLabel: string; // label on the "add tag" chip
  tags: string[]; // currently assigned tags
  suggestions: string[]; // recently used tags to offer as chips
  onChange: (tags: string[]) => void;
  onClose: () => void;
};

export function TagModal({
  visible,
  title,
  subtitle,
  addLabel,
  tags,
  suggestions,
  onChange,
  onClose,
}: TagModalProps) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [showInput, setShowInput] = useState(false);
  const [draft, setDraft] = useState('');

  function toggleTag(tag: string) {
    const has = tags.some((tg) => tg.toLowerCase() === tag.toLowerCase());
    if (has) {
      // Confirm before removing an already-assigned tag.
      Alert.alert(t('tagModal.removeTitle'), t('tagModal.removeMsg', { tag }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tagModal.remove'),
          style: 'destructive',
          onPress: () => onChange(tags.filter((tg) => tg.toLowerCase() !== tag.toLowerCase())),
        },
      ]);
    } else {
      onChange([...tags, tag]);
    }
  }

  function addTag() {
    const v = draft.trim();
    setDraft('');
    setShowInput(false);
    if (!v || tags.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...tags, v]);
  }

  function closeModal() {
    addTag(); // commit any pending draft
    onClose();
  }

  // Show assigned tags first, then any suggestions not already assigned.
  const chipTags = [...tags];
  for (const s of suggestions) {
    if (!chipTags.some((tg) => tg.toLowerCase() === s.toLowerCase())) chipTags.push(s);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <Pressable style={styles.modalBackdrop} onPress={closeModal}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalPhrase} numberOfLines={2}>
            {subtitle}
          </Text>

          <View style={styles.tagEditRow}>
            {chipTags.map((tag) => {
              const on = tags.some((tg) => tg.toLowerCase() === tag.toLowerCase());
              return (
                <Pressable
                  key={tag}
                  style={[styles.tagChip, on && styles.tagChipOn]}
                  onPress={() => toggleTag(tag)}
                >
                  {on && <Ionicons name="checkmark" size={12} color={theme.colors.text} />}
                  <Text style={[styles.tagChipText, on && styles.tagChipTextOn]}>{tag}</Text>
                </Pressable>
              );
            })}
            {showInput ? (
              <TextInput
                style={styles.tagInput}
                placeholder={t('tagModal.newTag')}
                placeholderTextColor={theme.colors.textFaint}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={addTag}
                onBlur={addTag}
                autoFocus
                returnKeyType="done"
              />
            ) : (
              <Pressable
                style={[styles.tagChip, styles.tagChipAdd]}
                onPress={() => setShowInput(true)}
              >
                <Ionicons name="add" size={13} color={theme.colors.accent} />
                <Text style={styles.tagChipAddText}>{addLabel}</Text>
              </Pressable>
            )}
          </View>

          <Pressable style={styles.modalCloseBtn} onPress={closeModal}>
            <Text style={styles.modalCloseText}>{t('tagModal.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Read-only row of tag badges shown beneath a phrase / vocab entry.
export function TagBadges({ tags }: { tags: string[] }) {
  const styles = useStyles(makeStyles);
  if (tags.length === 0) return null;
  return (
    <View style={styles.tagDisplayRow}>
      {tags.map((tag) => (
        <View key={tag} style={styles.tagBadge}>
          <Text style={styles.tagBadgeText}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  tagDisplayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagBadge: {
    backgroundColor: theme.colors.accent2Dim,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagBadgeText: { color: theme.colors.accent2, fontSize: 11, fontWeight: '700' },

  tagEditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.bgElevated,
  },
  tagChipOn: { borderColor: theme.colors.accent2, backgroundColor: theme.colors.accent2Dim },
  tagChipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  tagChipTextOn: { color: theme.colors.text },
  tagChipAdd: { borderStyle: 'dashed', borderColor: theme.colors.accent },
  tagChipAddText: { color: theme.colors.accent, fontSize: 12, fontWeight: '700' },
  tagInput: {
    minWidth: 110,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 5 : 2,
    color: theme.colors.text,
    fontSize: 12,
    backgroundColor: theme.colors.bgElevated,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000AA',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 20,
  },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  modalPhrase: { color: theme.colors.textMuted, fontSize: 14, marginTop: 4, marginBottom: 14 },
  modalCloseBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.accent,
    paddingVertical: 13,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
  },
  modalCloseText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
