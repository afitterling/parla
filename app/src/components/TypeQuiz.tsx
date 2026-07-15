import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
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
import { SpeakButton } from './SpeakButton';

// One thing to be quizzed. `prompt` is shown (usually the native-language
// meaning); the learner types `answer` — or, for romanized goal languages, its
// `pinyin`. Both are accepted so a user with a Chinese keyboard can type either.
export type QuizItem = {
  id: string;
  prompt: string; // shown as the question (the meaning)
  answer: string; // the target word/phrase (characters)
  pinyin?: string; // romanization — the expected typed answer for romanized langs
  tags: string[];
  lang: string;
};

type Props = {
  items: QuizItem[];
  romanized: boolean; // goal language uses pinyin/romaji → user types the romanization
  answerLangName: string; // goal language name, for the "type in X" hint
  locale: string; // speech locale for the reveal's speak button
  tagSuggestions: string[];
  onResult?: (id: string, correct: boolean) => void; // persist a review (phrases)
};

// Fold away everything that shouldn't matter when comparing a typed answer:
// tone marks / accents (via NFD + combining-mark strip), case, whitespace and
// punctuation. So "Gōng chē!" and "gongche" compare equal.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s.,!?;:'’"·、。！？，…()\-—_/]/g, '');
}

function isCorrect(input: string, item: QuizItem): boolean {
  const got = normalize(input);
  if (!got) return false;
  const accepted = [item.pinyin, item.answer].filter(Boolean).map((s) => normalize(s as string));
  return accepted.includes(got);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function TypeQuiz({
  items,
  romanized,
  answerLangName,
  locale,
  tagSuggestions,
  onResult,
}: Props) {
  const t = useT();
  const styles = useStyles(makeStyles);
  const theme = useTheme();

  const [sessionTag, setSessionTag] = useState<string | null>(null);
  const [queue, setQueue] = useState<QuizItem[] | null>(null); // null = setup
  const [total, setTotal] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);

  const pool = useMemo(
    () =>
      items.filter(
        (it) => !sessionTag || it.tags.some((tag) => tag.toLowerCase() === sessionTag.toLowerCase())
      ),
    [items, sessionTag]
  );

  function start() {
    const q = shuffle(pool);
    setQueue(q);
    setTotal(q.length);
    setScore(0);
    setInput('');
    setChecked(false);
  }

  function reset() {
    setQueue(null);
    setInput('');
    setChecked(false);
  }

  const current = queue && queue.length > 0 ? queue[0] : null;

  function check() {
    if (!current || checked) return;
    const ok = isCorrect(input, current);
    setLastCorrect(ok);
    setChecked(true);
    if (ok) setScore((s) => s + 1);
    onResult?.(current.id, ok);
  }

  function reveal() {
    // Give up on this card → show the answer, scored as wrong.
    if (!current || checked) return;
    setLastCorrect(false);
    setChecked(true);
    onResult?.(current.id, false);
  }

  function next() {
    setQueue((q) => (q ? q.slice(1) : q));
    setInput('');
    setChecked(false);
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  if (queue === null) {
    if (items.length === 0) {
      return (
        <View style={styles.center}>
          <Ionicons name="create-outline" size={52} color={theme.colors.textFaint} />
          <Text style={styles.dim}>{t('quiz.empty')}</Text>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.hint}>{t('quiz.whichItems')}</Text>
        <TagFilterRow tags={tagSuggestions} value={sessionTag} onChange={setSessionTag} />
        <View style={styles.center}>
          <Text style={styles.poolCount}>{t('quiz.poolCount', { count: pool.length })}</Text>
          <Pressable
            style={[styles.bigBtn, pool.length === 0 && styles.bigBtnDisabled]}
            disabled={pool.length === 0}
            onPress={start}
          >
            <Text style={styles.bigBtnText}>{t('quiz.start')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (!current) {
    return (
      <View style={styles.center}>
        <Ionicons name="trophy-outline" size={52} color={theme.colors.accent} />
        <Text style={styles.doneTitle}>{t('quiz.doneTitle', { score, total })}</Text>
        <Pressable style={styles.bigBtn} onPress={start}>
          <Text style={styles.bigBtnText}>{t('quiz.again')}</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={reset}>
          <Text style={styles.linkBtnText}>{t('train.changeSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  const done = total - queue.length;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.progressRow}>
        <Text style={styles.progressScore}>
          {score}/{total}
        </Text>
        <Text style={styles.progressText}>
          {done + 1}/{total}
        </Text>
        <Pressable onPress={reset} hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.cardWrap}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.side}>{t('quiz.meaning')}</Text>
          <Text style={styles.prompt}>{current.prompt}</Text>
          <Text style={styles.hintSmall}>
            {romanized ? t('quiz.typePinyin') : t('quiz.typeAnswer', { lang: answerLangName })}
          </Text>

          <TextInput
            style={[
              styles.input,
              checked && (lastCorrect ? styles.inputCorrect : styles.inputWrong),
            ]}
            value={input}
            onChangeText={setInput}
            editable={!checked}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={romanized ? 'pinyin …' : '…'}
            placeholderTextColor={theme.colors.textFaint}
            returnKeyType="done"
            onSubmitEditing={check}
          />

          {checked && (
            <View style={styles.result}>
              <View style={styles.resultHead}>
                <Ionicons
                  name={lastCorrect ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={lastCorrect ? theme.colors.success : theme.colors.danger}
                />
                <Text
                  style={[
                    styles.resultLabel,
                    { color: lastCorrect ? theme.colors.success : theme.colors.danger },
                  ]}
                >
                  {lastCorrect ? t('quiz.correct') : t('quiz.wrong')}
                </Text>
              </View>
              <View style={styles.answerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.answerText}>{current.answer}</Text>
                  {!!current.pinyin && <Text style={styles.answerPinyin}>{current.pinyin}</Text>}
                </View>
                <SpeakButton text={current.answer} locale={locale} />
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {checked ? (
        <Pressable style={styles.primaryBtn} onPress={next}>
          <Text style={styles.primaryBtnText}>{t('quiz.next')}</Text>
        </Pressable>
      ) : (
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, styles.revealBtn]} onPress={reveal}>
            <Text style={styles.revealText}>{t('quiz.showAnswer')}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.checkBtn, !input.trim() && styles.bigBtnDisabled]}
            disabled={!input.trim()}
            onPress={check}
          >
            <Text style={styles.checkText}>{t('quiz.check')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

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
  const styles = useStyles(makeStyles);
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    dim: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    hint: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      marginLeft: 16,
      marginTop: 6,
      marginBottom: 8,
    },
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

    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 4,
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

    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 8,
      gap: 12,
    },
    progressScore: { color: theme.colors.success, fontSize: 16, fontWeight: '800' },
    progressText: { color: theme.colors.accent, fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },

    cardWrap: { padding: 16 },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 24,
    },
    side: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    prompt: { color: theme.colors.text, fontSize: 26, fontWeight: '700', lineHeight: 34 },
    hintSmall: { color: theme.colors.textFaint, fontSize: 12, marginTop: 12, marginBottom: 6 },
    input: {
      backgroundColor: theme.colors.bgElevated,
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      borderColor: theme.colors.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '600',
    },
    inputCorrect: { borderColor: theme.colors.success },
    inputWrong: { borderColor: theme.colors.danger },

    result: {
      marginTop: 18,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.cardBorder,
    },
    resultHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    resultLabel: { fontSize: 14, fontWeight: '800' },
    answerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    answerText: { color: theme.colors.text, fontSize: 24, fontWeight: '700' },
    answerPinyin: { color: theme.colors.accent2, fontSize: 15, marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
    actionBtn: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
    },
    revealBtn: {
      backgroundColor: theme.colors.bgElevated,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    revealText: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 15 },
    checkBtn: { backgroundColor: theme.colors.accent },
    checkText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    primaryBtn: {
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: theme.colors.accent,
      paddingVertical: 16,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
