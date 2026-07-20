import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import { answerMatches } from '../answers';
import {
  DEFAULT_QUIZ_PREFS,
  QUIZ_COUNTS,
  QUIZ_RECENT_DAYS,
  QuizPrefs,
  QuizDirection,
  QuizScope,
  QuizSource,
  loadQuizPrefs,
  saveQuizPrefs,
} from '../storage';
import { SpeakButton } from './SpeakButton';

// One thing to be quizzed. Which of the three sides is the question and which
// is the answer depends on the session's direction (see QuizDirection).
export type QuizItem = {
  id: string;
  term: string; // the word/phrase in the goal language (characters)
  translation: string; // its meaning in the learner's language
  pinyin?: string; // romanization — Pinyin/Romaji
  tags: string[];
  lang: string;
  createdAt: number; // when it was saved — drives the "last N days" selection
  known: number; // times answered correctly; >0 means "already learned"
};

// The question side, the accepted answers, and what the input is asking for.
// 'toWord' takes the characters *or* the romanization, so a learner without a
// Chinese keyboard is never stuck.
function faces(item: QuizItem, direction: QuizDirection) {
  if (direction === 'toReading') {
    return { prompt: item.term, accepted: [item.pinyin], askReading: true };
  }
  if (direction === 'toMeaning') {
    return { prompt: item.term, accepted: [item.translation], askReading: false };
  }
  return { prompt: item.translation, accepted: [item.term, item.pinyin], askReading: true };
}

// An item can only be asked in a direction it actually has an answer for.
function answerable(item: QuizItem, direction: QuizDirection): boolean {
  if (direction === 'toReading') return !!item.pinyin?.trim();
  if (direction === 'toMeaning') return !!item.translation.trim();
  return !!item.term.trim();
}

type Props = {
  items: QuizItem[];
  romanized: boolean; // goal language uses pinyin/romaji → user types the romanization
  answerLangName: string; // goal language name, for the "type in X" hint
  locale: string; // speech locale for the reveal's speak button
  tagSuggestions: string[];
  scope: QuizScope; // which collection — quiz preferences are remembered per scope
  onResult?: (id: string, correct: boolean) => void; // persist a review
};


function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY_MS = 86_400_000;

// Round-robin across tags, so a "mix" session touches every topic instead of
// marching through one. Untagged items form a bucket of their own.
function mixByTag(items: QuizItem[]): QuizItem[] {
  const buckets = new Map<string, QuizItem[]>();
  for (const it of shuffle(items)) {
    const key = (it.tags[0] ?? '').toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) bucket.push(it);
    else buckets.set(key, [it]);
  }
  const lists = [...buckets.values()];
  const deepest = Math.max(0, ...lists.map((l) => l.length));
  const out: QuizItem[] = [];
  for (let i = 0; i < deepest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

// Everything the current preferences allow into a session, before shuffling and
// before the card-count cap.
function selectPool(items: QuizItem[], prefs: QuizPrefs, now: number): QuizItem[] {
  const askable = items.filter((it) => answerable(it, prefs.direction));
  const pool = prefs.skipLearned ? askable.filter((it) => !it.known) : askable;
  if (prefs.source === 'recent') {
    return pool.filter((it) => now - it.createdAt <= QUIZ_RECENT_DAYS * DAY_MS);
  }
  if (prefs.source === 'tags' && prefs.tags.length > 0) {
    const wanted = prefs.tags.map((t) => t.toLowerCase());
    return pool.filter((it) => it.tags.some((t) => wanted.includes(t.toLowerCase())));
  }
  return pool; // 'random', 'mix', or 'tags' with nothing picked yet
}

export function TypeQuiz({
  items,
  romanized,
  answerLangName,
  locale,
  tagSuggestions,
  scope,
  onResult,
}: Props) {
  const t = useT();
  const styles = useStyles(makeStyles);
  const theme = useTheme();

  const [prefs, setPrefs] = useState<QuizPrefs>(DEFAULT_QUIZ_PREFS);
  const [queue, setQueue] = useState<QuizItem[] | null>(null); // null = setup
  const [total, setTotal] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);

  // Restore the last session's selection; every change is written straight back.
  useEffect(() => {
    let alive = true;
    loadQuizPrefs(scope).then((p) => {
      if (alive) setPrefs(p);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  function updatePrefs(patch: Partial<QuizPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveQuizPrefs(scope, next);
      return next;
    });
  }

  // Recomputed on every render of the setup screen so the count stays honest as
  // options are toggled. Date.now() is only read while setting up.
  const pool = useMemo(() => selectPool(items, prefs, Date.now()), [items, prefs]);
  const learnedCount = items.filter((it) => it.known > 0).length;
  const typing = prefs.answerMode === 'type';
  const sessionSize = prefs.count > 0 ? Math.min(prefs.count, pool.length) : pool.length;

  function start() {
    const ordered = prefs.source === 'mix' ? mixByTag(pool) : shuffle(pool);
    const q = prefs.count > 0 ? ordered.slice(0, prefs.count) : ordered;
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
    const ok = answerMatches(input, faces(current, prefs.direction).accepted);
    setLastCorrect(ok);
    setChecked(true);
    if (ok) setScore((s) => s + 1);
    onResult?.(current.id, ok);
  }

  function reveal() {
    // Typing mode: give up on this card → show the answer, scored as wrong.
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

  // ── Flashcard grading (reveal mode) ────────────────────────────────────────
  // "Knew it" retires the card; "Again" sends it to the back of the queue, so a
  // session ends only once every card has been known at least once.
  function gradeKnown() {
    if (!current) return;
    onResult?.(current.id, true);
    setScore((s) => s + 1);
    next();
  }

  function gradeAgain() {
    if (!current) return;
    onResult?.(current.id, false);
    setQueue((q) => (q ? [...q.slice(1), q[0]] : q));
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
    // "Type the reading" only makes sense where there is a romanization.
    const directions: { key: QuizDirection; label: string }[] = [
      { key: 'toWord', label: t('quiz.dirToWord') },
      ...(romanized ? [{ key: 'toReading' as const, label: t('quiz.dirToReading') }] : []),
      { key: 'toMeaning', label: t('quiz.dirToMeaning') },
    ];
    const sources: { key: QuizSource; label: string }[] = [
      { key: 'recent', label: t('quiz.srcRecent', { days: QUIZ_RECENT_DAYS }) },
      { key: 'mix', label: t('quiz.srcMix') },
      { key: 'tags', label: t('quiz.srcTags') },
      { key: 'random', label: t('quiz.srcRandom') },
    ];
    return (
      <View style={{ flex: 1 }}>
        {/* The whole setup scrolls — with many tags it outgrows a phone screen. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.setup}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>{t('quiz.direction')}</Text>
          <View style={styles.chipRow}>
            {directions.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                on={prefs.direction === d.key}
                onPress={() => updatePrefs({ direction: d.key })}
              />
            ))}
          </View>

          <Text style={styles.hint}>{t('train.answerMode')}</Text>
          <View style={styles.chipRow}>
            <Chip
              label={t('train.modeReveal')}
              on={prefs.answerMode === 'reveal'}
              onPress={() => updatePrefs({ answerMode: 'reveal' })}
            />
            <Chip
              label={t('train.modeType')}
              on={prefs.answerMode === 'type'}
              onPress={() => updatePrefs({ answerMode: 'type' })}
            />
          </View>

          <Text style={styles.hint}>{t('quiz.whichItems')}</Text>
          <View style={styles.chipRow}>
            {sources.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                on={prefs.source === s.key}
                onPress={() => updatePrefs({ source: s.key })}
              />
            ))}
          </View>

          {prefs.source === 'tags' && (
            <>
              <Text style={styles.hint}>{t('quiz.pickTags')}</Text>
              {tagSuggestions.length === 0 ? (
                <Text style={styles.dimLeft}>{t('quiz.noTags')}</Text>
              ) : (
                <View style={styles.chipRow}>
                  {tagSuggestions.map((tag) => {
                    const on = prefs.tags.some((s) => s.toLowerCase() === tag.toLowerCase());
                    return (
                      <Chip
                        key={tag}
                        label={tag}
                        on={on}
                        onPress={() =>
                          updatePrefs({
                            tags: on
                              ? prefs.tags.filter((s) => s.toLowerCase() !== tag.toLowerCase())
                              : [...prefs.tags, tag],
                          })
                        }
                      />
                    );
                  })}
                </View>
              )}
            </>
          )}

          <Text style={styles.hint}>{t('quiz.howMany')}</Text>
          <View style={styles.chipRow}>
            {QUIZ_COUNTS.map((n) => (
              <Chip
                key={n}
                label={n === 0 ? t('common.all') : String(n)}
                on={prefs.count === n}
                onPress={() => updatePrefs({ count: n })}
              />
            ))}
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>{t('quiz.skipLearned')}</Text>
              <Text style={styles.switchSub}>{t('quiz.learnedCount', { count: learnedCount })}</Text>
            </View>
            <Switch
              value={prefs.skipLearned}
              onValueChange={(v) => updatePrefs({ skipLearned: v })}
              trackColor={{ true: theme.colors.accent, false: theme.colors.cardBorder }}
            />
          </View>
        </ScrollView>

        <View style={styles.startBar}>
          <Text style={styles.poolCount}>{t('quiz.poolCount', { count: sessionSize })}</Text>
          <Pressable
            style={[styles.bigBtn, sessionSize === 0 && styles.bigBtnDisabled]}
            disabled={sessionSize === 0}
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
        <Text style={styles.doneTitle}>
          {typing ? t('quiz.doneTitle', { score, total }) : t('train.doneTitle', { total })}
        </Text>
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
  const face = faces(current, prefs.direction);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.progressRow}>
        {/* A flashcard session only ends once every card was "knew it", so a
            score would always read N/N — show progress alone. */}
        {typing && (
          <Text style={styles.progressScore}>
            {score}/{total}
          </Text>
        )}
        <Text style={styles.progressText}>
          {done + 1}/{total}
        </Text>
        <Pressable onPress={reset} hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      {/* Card + actions scroll together, and the scroll view insets itself for
          the keyboard — otherwise the buttons end up buried under it. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.cardWrap}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          style={styles.card}
          onPress={() => !typing && !checked && setChecked(true)}
        >
          <Text style={styles.side}>
            {prefs.direction === 'toWord' ? t('quiz.meaning') : t('quiz.wordSide')}
          </Text>
          <Text style={styles.prompt}>{face.prompt}</Text>
          {!typing && !checked && (
            <Text style={styles.hintSmall}>{t('train.tapToReveal')}</Text>
          )}
          {typing && (
            <Text style={styles.hintSmall}>
              {!face.askReading
                ? t('train.typeMeaning')
                : romanized
                  ? t('quiz.typePinyin')
                  : t('quiz.typeAnswer', { lang: answerLangName })}
            </Text>
          )}

          {/* Submit sits next to the input: with the keyboard up there is no
              room for a button below the card. */}
          {typing && (
          <View style={styles.inputRow}>
            <TextInput
              // Remount per card so autoFocus fires again on the next one.
              key={current.id}
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
              placeholder={face.askReading && romanized ? 'pinyin …' : '…'}
              placeholderTextColor={theme.colors.textFaint}
              returnKeyType="done"
              onSubmitEditing={check}
            />
            {!checked && (
              <Pressable
                style={[styles.submitBtn, !input.trim() && styles.bigBtnDisabled]}
                disabled={!input.trim()}
                onPress={check}
                accessibilityLabel={t('quiz.check')}
              >
                <Ionicons name="arrow-forward" size={22} color="#fff" />
              </Pressable>
            )}
          </View>
          )}

          {checked && (
            <View style={styles.result}>
              {typing && (
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
              )}
              {/* Always show the full card on reveal — word, reading, meaning —
                  whichever side was asked for. */}
              <View style={styles.answerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.answerText}>{current.term}</Text>
                  {!!current.pinyin && <Text style={styles.answerPinyin}>{current.pinyin}</Text>}
                  {prefs.direction !== 'toWord' && !!current.translation && (
                    <Text style={styles.answerTrans}>{current.translation}</Text>
                  )}
                </View>
                <SpeakButton text={current.term} locale={locale} />
              </View>
            </View>
          )}
        </Pressable>

        {typing ? (
          checked ? (
            <Pressable style={styles.primaryBtn} onPress={next}>
              <Text style={styles.primaryBtnText}>{t('quiz.next')}</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.actionBtn, styles.revealBtn]} onPress={reveal}>
              <Text style={styles.revealText}>{t('quiz.showAnswer')}</Text>
            </Pressable>
          )
        ) : checked ? (
          // Flashcard grading — "Gewusst" is what marks a card as learned.
          <View style={styles.gradeRow}>
            <Pressable style={[styles.gradeBtn, styles.againBtn]} onPress={gradeAgain}>
              <Ionicons name="refresh" size={17} color={theme.colors.textMuted} />
              <Text style={styles.againText}>{t('train.againBtn')}</Text>
            </Pressable>
            <Pressable style={[styles.gradeBtn, styles.knownBtn]} onPress={gradeKnown}>
              <Ionicons name="checkmark" size={17} color="#04210f" />
              <Text style={styles.knownText}>{t('train.knownBtn')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={() => setChecked(true)}>
            <Text style={styles.primaryBtnText}>{t('train.reveal')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={[styles.filterChip, on && styles.filterChipOn]} onPress={onPress}>
      <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{label}</Text>
    </Pressable>
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
      marginTop: 18,
      marginBottom: 8,
    },
    dimLeft: { color: theme.colors.textFaint, fontSize: 13, paddingHorizontal: 16 },
    poolCount: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
    setup: { paddingBottom: 16 },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 16,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginTop: 20,
      padding: 14,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    switchLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
    switchSub: { color: theme.colors.textFaint, fontSize: 12, marginTop: 2 },
    startBar: {
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.cardBorder,
    },
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
      flex: 1,
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
    answerTrans: { color: theme.colors.textMuted, fontSize: 15, marginTop: 4 },

    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    gradeRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    gradeBtn: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 16,
      borderRadius: theme.radius.pill,
    },
    againBtn: {
      backgroundColor: theme.colors.bgElevated,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    againText: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 15 },
    knownBtn: { backgroundColor: theme.colors.success },
    knownText: { color: '#04210f', fontWeight: '800', fontSize: 15 },
    submitBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    actionBtn: {
      marginTop: 12,
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
    primaryBtn: {
      marginTop: 12,
      backgroundColor: theme.colors.accent,
      paddingVertical: 16,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
