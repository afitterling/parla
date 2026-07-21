import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  subtitlePinyin?: string; // its reading, shown under the phrase when there is one
  subtitleTranslation?: string; // what it means, under the reading
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
  subtitlePinyin,
  subtitleTranslation,
  addLabel,
  tags,
  suggestions,
  onChange,
  onClose,
}: TagModalProps) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const editorRef = useRef<TagEditorHandle>(null);

  function closeModal() {
    editorRef.current?.commit(); // commit any pending draft
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closeModal}
    >
      {/* Full screen rather than a centred card: a phrase with many tags had to
          scroll inside a box that was itself already scrolling. SafeAreaView
          keeps the header clear of the notch, matching App.tsx. */}
      <SafeAreaView style={styles.fullScreen}>
        {/* Title left, close top right — the only way out now that there is no
            backdrop to tap. */}
        <View style={styles.header}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable
            style={styles.closeIconBtn}
            onPress={closeModal}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('tagModal.close')}
          >
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* flexGrow + centre: the phrase is the point of this screen, so it sits
            in the middle at reading size rather than tucked in the top corner.
            Long phrases and many tags still push it back to a normal scroll. */}
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.modalPhrase, !!subtitlePinyin && styles.modalPhraseTight]}>
            {subtitle}
          </Text>
          {/* The row this sheet opens from shows the reading, so the sheet does
              too — otherwise tapping a phrase loses the one thing you cannot
              recover by looking at the characters. */}
          {!!subtitlePinyin && <Text style={styles.modalPinyin}>{subtitlePinyin}</Text>}
          {/* Characters, reading, meaning — the three things the row shows, in
              the same order, so the sheet is the row writ large. */}
          {!!subtitleTranslation && (
            <Text style={styles.modalTranslation}>{subtitleTranslation}</Text>
          )}

          <View style={styles.editorWrap}>
            <TagEditor
              ref={editorRef}
              addLabel={addLabel}
              tags={tags}
              suggestions={suggestions}
              onChange={onChange}
              centered
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// The chip row itself — assigned tags, suggestions, and a free-text field for a
// brand-new custom tag. Shared by TagModal and the full-screen word card.
export type TagEditorHandle = { commit: () => void };

type TagEditorProps = {
  addLabel: string;
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  // Opt-in: centres the chips instead of running them from the left. Only the
  // full-screen phrase sheet wants this — WordCard keeps the left-aligned row.
  centered?: boolean;
};

export const TagEditor = forwardRef<TagEditorHandle, TagEditorProps>(function TagEditor(
  { addLabel, tags, suggestions, onChange, centered },
  ref
) {
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

  // Straight removal via the chip's ✕ — no confirmation, the tag is one tap
  // away from being added back.
  function removeTag(tag: string) {
    onChange(tags.filter((tg) => tg.toLowerCase() !== tag.toLowerCase()));
  }

  function addTag() {
    const v = draft.trim();
    setDraft('');
    setShowInput(false);
    if (!v || tags.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...tags, v]);
  }

  // Let the host commit a half-typed custom tag when it closes.
  useImperativeHandle(ref, () => ({ commit: addTag }));

  // Show assigned tags first, then any suggestions not already assigned.
  const chipTags = [...tags];
  for (const s of suggestions) {
    if (!chipTags.some((tg) => tg.toLowerCase() === s.toLowerCase())) chipTags.push(s);
  }

  return (
    <View style={[styles.tagEditRow, centered && styles.tagEditRowCentered]}>
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
            {on && (
              <Pressable onPress={() => removeTag(tag)} hitSlop={10} style={styles.tagChipRemove}>
                <Ionicons name="close" size={13} color={theme.colors.textMuted} />
              </Pressable>
            )}
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
        <Pressable style={[styles.tagChip, styles.tagChipAdd]} onPress={() => setShowInput(true)}>
          <Ionicons name="add" size={13} color={theme.colors.accent} />
          <Text style={styles.tagChipAddText}>{addLabel}</Text>
        </Pressable>
      )}
    </View>
  );
});

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
  tagEditRowCentered: { justifyContent: 'center' },
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
  tagChipRemove: { marginLeft: 2 },
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

  fullScreen: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  // Negative margin pulls the tap target's padding back to the screen edge so
  // the glyph itself stays optically aligned with the content below it.
  closeIconBtn: { padding: 6, marginRight: -6 },
  modalScroll: { flex: 1 },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
  },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800' },
  // The phrase is the hero here, not a subtitle: full text colour, display size.
  modalPhrase: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  // The reading takes over the gap below the phrase so the two read as one block.
  modalPhraseTight: { marginBottom: 0 },
  modalPinyin: {
    color: theme.colors.accent2,
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  modalTranslation: {
    color: theme.colors.textMuted,
    fontSize: 18,
    lineHeight: 25,
    textAlign: 'center',
    marginBottom: 22,
  },
  // Full width so the centred chip row has room to centre within, and to wrap.
  editorWrap: { width: '100%' },
  });
}
