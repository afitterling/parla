import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import { VocabItem } from '../storage';
import { findLanguage, speechLocale, usesHanzi } from '../languages';
import { hasHanzi } from '../strokes';
import { allowRotation, lockPortrait } from '../orientation';
import { SpeakButton } from './SpeakButton';
import { StrokeOrderView } from './StrokeOrderView';
import { TagEditor, TagEditorHandle } from './TagModal';

// Full-screen "lens" view of a single vocabulary card, opened by tapping the
// row. It simply fills the screen in whatever orientation the device is held —
// portrait stays portrait, turning the phone gives a wide landscape card (the
// modal is allowed to rotate even though the rest of the app is portrait).
type Props = {
  visible: boolean;
  item: VocabItem | null;
  suggestions: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
  /** Open straight into stroke practice instead of the word side. */
  initialStrokes?: boolean;
};

export function WordCard({
  visible,
  item,
  suggestions,
  onChange,
  onClose,
  initialStrokes = false,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [strokes, setStrokes] = useState(initialStrokes);
  const tagsRef = useRef<TagEditorHandle>(null);

  // Reset the side we show each time the card is opened.
  useEffect(() => {
    if (visible) setStrokes(initialStrokes);
  }, [visible, initialStrokes]);

  // While the card is up the learner may turn the phone; the rest of the app
  // stays portrait, so lock back on close.
  useEffect(() => {
    if (!visible) return;
    allowRotation();
    return () => lockPortrait();
  }, [visible]);

  if (!item) return null;

  const landscape = width > height;
  const canStrokes = usesHanzi(item.lang) && hasHanzi(item.term);
  const locale = speechLocale(findLanguage(item.lang));
  // The character should stay comfortably inside the shorter screen edge.
  const canvas = Math.min(Math.min(width, height) - 60, landscape ? height - 150 : 320);

  function close() {
    tagsRef.current?.commit(); // keep a half-typed custom tag
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={close}
      supportedOrientations={['portrait', 'landscape']}
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconBtn} onPress={close} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.topRight}>
            {canStrokes && (
              <Pressable
                style={[styles.outlineBtn, strokes && styles.outlineBtnOn]}
                onPress={() => setStrokes((v) => !v)}
                hitSlop={8}
                accessibilityLabel={t('vocab.strokes')}
              >
                <Ionicons name="brush-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.outlineBtnText}>{t('vocab.strokes')}</Text>
              </Pressable>
            )}
            <SpeakButton
              text={item.example ? `${item.term}. ${item.example}` : item.term}
              locale={locale}
            />
          </View>
        </View>

        <View style={styles.body}>
          {strokes ? (
            <StrokeOrderView term={item.term} size={canvas} />
          ) : (
            /* Word + example + tags can outgrow the screen — scroll them rather
               than clipping; flex/stretch so the pane fills the centered body. */
            <ScrollView
              style={styles.wordScroll}
              contentContainerStyle={styles.wordPane}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={[styles.bigTerm, { fontSize: landscape ? 96 : 76 }]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {item.term}
              </Text>
              {!!item.pinyin && <Text style={styles.bigPinyin}>{item.pinyin}</Text>}
              {!!item.translation && <Text style={styles.bigTrans}>{item.translation}</Text>}
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
              <TagEditor
                ref={tagsRef}
                addLabel={t('vocab.tag')}
                tags={item.tags}
                suggestions={suggestions}
                onChange={onChange}
              />
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bgElevated,
    },
    outlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    outlineBtnOn: { backgroundColor: theme.colors.accentDim },
    outlineBtnText: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    wordScroll: { flex: 1, alignSelf: 'stretch' },
    wordPane: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      gap: 6,
    },
    bigTerm: { color: theme.colors.text, fontWeight: '700', textAlign: 'center' },
    bigPinyin: { color: theme.colors.accent2, fontSize: 22, fontWeight: '600' },
    bigTrans: { color: theme.colors.textMuted, fontSize: 20 },
    exampleBlock: { alignItems: 'center', marginTop: 10, gap: 2 },
    example: { color: theme.colors.text, fontSize: 17, fontStyle: 'italic', textAlign: 'center' },
    examplePinyin: { color: theme.colors.accent2, fontSize: 14, textAlign: 'center' },
    exampleTrans: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontStyle: 'italic',
      textAlign: 'center',
    },
  });
}
