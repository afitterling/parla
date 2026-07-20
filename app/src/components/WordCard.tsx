import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { transliterate } from '../api';
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
  openaiKey: string;
  onChange: (tags: string[]) => void;
  /** Persist a backfilled reading onto the word. */
  onFillPinyin: (pinyin: string) => void;
  onClose: () => void;
  /** Open straight into stroke practice instead of the word side. */
  initialStrokes?: boolean;
};

export function WordCard({
  visible,
  item,
  suggestions,
  openaiKey,
  onChange,
  onFillPinyin,
  onClose,
  initialStrokes = false,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [strokes, setStrokes] = useState(initialStrokes);
  const [fetchingPinyin, setFetchingPinyin] = useState(false);
  const tagsRef = useRef<TagEditorHandle>(null);

  // Words saved by hand — or while the Pinyin toggle was off — carry no reading.
  // It is fetched on demand (never automatically: that would fire an API call
  // every time a card is opened) and handed up to be stored, so it is there next
  // time and on the other device, via the shared store.
  const lang = item ? findLanguage(item.lang) : null;
  const canPinyin = !!item && !!lang?.romanize;

  async function fillPinyin() {
    if (!item || !lang || fetchingPinyin) return;
    setFetchingPinyin(true);
    try {
      onFillPinyin(await transliterate(openaiKey, item.term, lang));
    } catch (e: any) {
      Alert.alert(t('vocab.makePinyin'), e?.message ?? String(e));
    } finally {
      setFetchingPinyin(false);
    }
  }

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
              {item.pinyin ? (
                <View style={styles.pinyinRow}>
                  <Text style={styles.bigPinyin}>{item.pinyin}</Text>
                  {canPinyin && (
                    <Pressable
                      onPress={fillPinyin}
                      disabled={fetchingPinyin}
                      hitSlop={10}
                      accessibilityLabel={t('vocab.makePinyin')}
                    >
                      {fetchingPinyin ? (
                        <ActivityIndicator size="small" color={theme.colors.accent2} />
                      ) : (
                        <Ionicons
                          name="refresh-outline"
                          size={18}
                          color={theme.colors.textFaint}
                        />
                      )}
                    </Pressable>
                  )}
                </View>
              ) : (
                canPinyin && (
                  <Pressable
                    style={styles.makePinyinBtn}
                    onPress={fillPinyin}
                    disabled={fetchingPinyin}
                  >
                    {fetchingPinyin ? (
                      <ActivityIndicator size="small" color={theme.colors.accent2} />
                    ) : (
                      <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent2} />
                    )}
                    <Text style={styles.makePinyinText}>{t('vocab.makePinyin')}</Text>
                  </Pressable>
                )
              )}
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
    pinyinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    makePinyinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.accent2,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginTop: 4,
    },
    makePinyinText: { color: theme.colors.accent2, fontWeight: '800', fontSize: 13 },
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
