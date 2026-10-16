import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  FREE_PER_HOUR,
  isPaywallActive,
  lessonKey,
  loadSymbolLesson,
  recordUsage,
  saveSymbolLesson,
  Settings,
  SymbolLesson,
  usageInLastHour,
  VocabItem,
} from '../storage';
import { explainSymbol } from '../api';
import { findLanguage, speechLocale } from '../languages';
import { hasHanzi } from '../strokes';
import { symbolAt, symbolCount } from '../symbols';
import { SpeakButton } from './SpeakButton';
import { StrokeOrderView } from './StrokeOrderView';
import { Paywall } from './Paywall';

// Full-screen card for one "symbol of the day": the character large, its
// reading, the Coach's explanation underneath (fetched once, cached), and the
// stroke-order animation for Han characters. ‹ › walk back through the symbols
// already handed out, so a missed notification is never lost; the sequence
// cannot be browsed ahead of time.
type Props = {
  visible: boolean;
  lang: string;
  index: number;
  /** Highest slot index handed out so far — the card cannot go past it. */
  maxIndex: number;
  settings: Settings;
  onIndexChange: (index: number) => void;
  onAddVocab: (item: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>) => void;
  onPurchasePro: () => void;
  onClose: () => void;
};

export function SymbolCard({
  visible,
  lang,
  index,
  maxIndex,
  settings,
  onIndexChange,
  onAddVocab,
  onPurchasePro,
  onClose,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [strokes, setStrokes] = useState(false);
  const [lesson, setLesson] = useState<SymbolLesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [added, setAdded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const symbol = symbolAt(lang, index);
  const goalLang = findLanguage(lang);
  const learnerLang = findLanguage(settings.inputLanguage);
  const total = symbolCount(lang);
  const canStrokes = !!symbol && hasHanzi(symbol.char);

  // Load the cached explanation, or ask the Coach for one, each time the card
  // shows a different character. The AI call counts against the free-tier
  // quota like a dialog turn; once the quota is used up the card still shows
  // the character and reading, plus a way to Pro.
  useEffect(() => {
    if (!visible || !symbol) return;
    let active = true;
    abortRef.current?.abort();
    setLesson(null);
    setError(null);
    setLimited(false);
    setAdded(false);
    setStrokes(false);
    const key = lessonKey(lang, symbol.char, learnerLang.code);
    (async () => {
      const cached = await loadSymbolLesson(key);
      if (!active) return;
      if (cached) {
        setLesson(cached);
        return;
      }
      if (isPaywallActive(settings.isPro) && (await usageInLastHour()) >= FREE_PER_HOUR) {
        if (active) setLimited(true);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const fresh = await explainSymbol(
          settings.openaiKey,
          symbol.char,
          goalLang,
          learnerLang,
          ctrl.signal
        );
        if (!active) return;
        if (isPaywallActive(settings.isPro)) await recordUsage();
        await saveSymbolLesson(key, fresh);
        setLesson(fresh);
      } catch (e: any) {
        if (!active || ctrl.signal.aborted) return;
        setError(e?.message ?? String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lang, index, learnerLang.code, settings.isPro]);

  useEffect(() => {
    if (!visible) abortRef.current?.abort();
  }, [visible]);

  if (!symbol) return null;

  const reading = lesson?.reading || symbol.reading || '';
  const landscape = width > height;
  const canvas = Math.min(Math.min(width, height) - 60, landscape ? height - 150 : 300);

  function addToVocab() {
    if (!symbol || added) return;
    const first = lesson?.examples[0];
    onAddVocab({
      term: symbol.char,
      pinyin: reading || undefined,
      translation: lesson?.meaning ?? '',
      lang,
      example: first?.text,
      examplePinyin: first?.reading,
      exampleTranslation: first?.translation,
    });
    setAdded(true);
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.nav}>
            <Pressable
              style={[styles.iconBtn, index <= 0 && styles.iconBtnOff]}
              onPress={() => onIndexChange(index - 1)}
              disabled={index <= 0}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>
            <Text style={styles.counter}>
              {t('symbol.counter', { n: (index % total) + 1, total })}
            </Text>
            <Pressable
              style={[styles.iconBtn, index >= maxIndex && styles.iconBtnOff]}
              onPress={() => onIndexChange(index + 1)}
              disabled={index >= maxIndex}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
            </Pressable>
          </View>
          <View style={styles.topRight}>
            {canStrokes && (
              <Pressable
                style={[styles.outlineBtn, strokes && styles.outlineBtnOn]}
                onPress={() => setStrokes((v) => !v)}
                hitSlop={8}
                accessibilityLabel={t('vocab.strokes')}
              >
                <Ionicons name="brush-outline" size={18} color={theme.colors.accent} />
              </Pressable>
            )}
            <SpeakButton text={symbol.char} locale={speechLocale(goalLang)} />
          </View>
        </View>

        {strokes ? (
          <View style={styles.body}>
            <StrokeOrderView term={symbol.char} size={canvas} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.pane}>
            <Text style={styles.kicker}>{t('symbol.title').toUpperCase()}</Text>
            <Text style={styles.langName}>{goalLang.nativeName}</Text>
            <Text style={styles.bigChar} adjustsFontSizeToFit numberOfLines={1}>
              {symbol.char}
            </Text>
            {!!reading && <Text style={styles.reading}>{reading}</Text>}

            {loading && (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.busyText}>{t('symbol.explaining')}</Text>
              </View>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
            {limited && (
              <Pressable style={styles.limitBox} onPress={() => setShowPaywall(true)}>
                <Ionicons name="lock-closed-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.limitText}>{t('symbol.limit')}</Text>
              </Pressable>
            )}

            {lesson && (
              <View style={styles.lesson}>
                <Text style={styles.sectionLabel}>{t('symbol.meaning').toUpperCase()}</Text>
                <Text style={styles.meaning}>{lesson.meaning}</Text>
                {lesson.examples.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>{t('symbol.examples').toUpperCase()}</Text>
                    {lesson.examples.map((e, i) => (
                      <View key={i} style={styles.example}>
                        <View style={styles.exampleHead}>
                          <Text style={styles.exampleText}>{e.text}</Text>
                          <SpeakButton text={e.text} locale={speechLocale(goalLang)} size={30} />
                        </View>
                        {!!e.reading && <Text style={styles.exampleReading}>{e.reading}</Text>}
                        {!!e.translation && (
                          <Text style={styles.exampleTrans}>{e.translation}</Text>
                        )}
                      </View>
                    ))}
                  </>
                )}
                {!!lesson.mnemonic && (
                  <>
                    <Text style={styles.sectionLabel}>{t('symbol.mnemonic').toUpperCase()}</Text>
                    <Text style={styles.mnemonic}>{lesson.mnemonic}</Text>
                  </>
                )}
              </View>
            )}

            <Pressable
              style={[styles.primaryBtn, added && styles.primaryBtnDone]}
              onPress={addToVocab}
              disabled={added}
            >
              <Ionicons
                name={added ? 'checkmark' : 'add'}
                size={18}
                color={added ? theme.colors.success : '#fff'}
              />
              <Text style={[styles.primaryBtnText, added && styles.primaryBtnTextDone]}>
                {added ? t('symbol.added') : t('symbol.addVocab')}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>

      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={() => {
          onPurchasePro();
          setShowPaywall(false);
        }}
      />
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
    nav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    counter: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      minWidth: 70,
      textAlign: 'center',
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
    iconBtnOff: { opacity: 0.3 },
    outlineBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
    },
    outlineBtnOn: { backgroundColor: theme.colors.accentDim },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    pane: { alignItems: 'center', paddingVertical: 12, paddingBottom: 40, gap: 6 },
    kicker: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    langName: { color: theme.colors.textFaint, fontSize: 13, fontWeight: '600' },
    bigChar: { color: theme.colors.text, fontSize: 120, fontWeight: '700', marginTop: 8 },
    reading: { color: theme.colors.accent2, fontSize: 24, fontWeight: '600' },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    busyText: { color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic' },
    error: { color: theme.colors.danger, fontSize: 13, textAlign: 'center', marginTop: 12 },
    limitBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      padding: 12,
    },
    limitText: { color: theme.colors.text, fontSize: 13, flex: 1 },
    lesson: {
      alignSelf: 'stretch',
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 16,
      marginTop: 16,
      gap: 4,
    },
    sectionLabel: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginTop: 10,
      marginBottom: 4,
    },
    meaning: { color: theme.colors.text, fontSize: 17, lineHeight: 24 },
    example: { marginBottom: 8 },
    exampleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    exampleText: { color: theme.colors.text, fontSize: 20, fontWeight: '700', flex: 1 },
    exampleReading: { color: theme.colors.accent2, fontSize: 14 },
    exampleTrans: { color: theme.colors.textMuted, fontSize: 14 },
    mnemonic: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontStyle: 'italic' },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.pill,
      paddingVertical: 14,
      paddingHorizontal: 24,
      marginTop: 20,
    },
    primaryBtnDone: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.success },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    primaryBtnTextDone: { color: theme.colors.success },
  });
}
