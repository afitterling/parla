import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import {
  FREE_PER_HOUR,
  isPaywallActive,
  DialogMsg,
  loadPinned,
  loadRecentDialog,
  PhraseItem,
  recordUsage,
  savePinned,
  saveRecentDialog,
  Settings,
  usageInLastHour,
  VocabItem,
} from '../storage';
import { findLanguage, speechLocale } from '../languages';
import { useRecorder } from '../useRecorder';
import { Paywall } from '../components/Paywall';
import { BusyOverlay } from '../components/BusyOverlay';
import { LanguagePicker } from '../components/LanguagePicker';
import { SpeakButton } from '../components/SpeakButton';
import { useT } from '../i18n/I18nContext';
import {
  breakdownSentence,
  chatWithAI,
  ChatTurn,
  DialogReply,
  transcribeAudio,
  transliterate,
  VocabSuggestion,
} from '../api';

type Mode = 'ask' | 'free';

type Msg = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  createdAt: number;
  pinyin?: string;
  translation?: string;
  vocab?: VocabSuggestion[];
  // Re-shown from a previous session (pinned card or recent-history window).
  // Still part of the conversation sent to the model — restoring is what lets
  // the dialog continue rather than start over.
  restored?: boolean;
};

type Props = {
  settings: Settings;
  onAddVocab: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) => void;
  onAddPhrase: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onUpdatePhrase: (id: string, patch: Partial<PhraseItem>) => void;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  onSwapLanguages: () => void;
  onPurchasePro: () => void;
  setDialogSort: (order: 'asc' | 'desc') => void;
  tagSuggestions: string[];
  contentLangCodes: string[]; // languages with saved content — shown on top of the input picker
};

export function DialogScreen({
  settings,
  onAddVocab,
  onAddPhrase,
  onUpdatePhrase,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  onSwapLanguages,
  onPurchasePro,
  setDialogSort,
  tagSuggestions,
  contentLangCodes,
}: Props) {
  const t = useT();
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  // Goal languages the learner has content in together with the current input
  // language — the goal picker surfaces these under "Existing content".
  const goalContentCodes = Array.from(
    new Set(settings.recentPairs.filter((p) => p.input === inputLang.code).map((p) => p.goal))
  );
  // Ask the model for the reading whenever the goal language has one — it is
  // always stored and always displayed, same as on the Phrases/Vocabulary
  // screens.
  const wantPinyin = !!goalLang.romanize;
  const [mode, setMode] = useState<Mode>(settings.defaultMode === 'ask' ? 'ask' : 'free');
  const [openMenu, setOpenMenu] = useState<'input' | 'goal' | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // status label or null
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The word-by-word breakdown runs its own request; kept separately so Cancel
  // can abort whichever of the two is in flight.
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const recorder = useRecorder();
  // Remaining free-tier quota this hour; null = unlimited (dev env or Pro).
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);
  // Pinned cards — persisted, restored into the dialog on every mount (the
  // dialog itself is ephemeral: it resets on tab switches and app restarts).
  const [pins, setPins] = useState<DialogMsg[]>([]);
  const pinnedIds = new Set(pins.map((p) => p.id));

  // Guards the auto-save below so the restore itself doesn't immediately write
  // back what it just read. Cleared again on a language switch, so the save
  // effect can't tag the outgoing pair's cards with the incoming pair.
  const hydrated = useRef(false);
  // The other pairs' recent cards, held aside so writing this pair's window
  // back doesn't drop theirs.
  const otherRecent = useRef<DialogMsg[]>([]);

  // A conversation belongs to exactly one input→goal pair, and only the pair
  // currently set up is shown — de → zh cards have no place in an en → en
  // dialog. Re-runs on a switch, which swaps the visible conversation.
  useEffect(() => {
    let active = true;
    hydrated.current = false;
    (async () => {
      const [storedPins, storedRecent] = await Promise.all([loadPinned(), loadRecentDialog()]);
      if (!active) return;
      const mine = (m: DialogMsg) => m.lang === goalLang.code && m.inputLang === inputLang.code;
      setPins(storedPins);
      otherRecent.current = storedRecent.filter((m) => !mine(m));
      // The two stores overlap whenever a card in the recent window is also
      // pinned. One entry per id, and the recent copy wins: it carries the
      // real creation time, while a pin's is the moment it was pinned.
      const byId = new Map<string, DialogMsg>();
      for (const m of storedPins.filter(mine)) byId.set(m.id, m);
      for (const m of storedRecent.filter(mine)) byId.set(m.id, m);
      setMessages(
        [...byId.values()]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            createdAt: m.createdAt,
            pinyin: m.pinyin,
            translation: m.translation,
            vocab: m.vocab,
            restored: true,
          }))
      );
      hydrated.current = true;
    })();
    return () => {
      active = false;
    };
  }, [goalLang.code, inputLang.code]);

  // Persist the tail of the dialog on every change, so a tab switch or a
  // restart comes back where it left off. saveRecentDialog trims to the window.
  useEffect(() => {
    if (!hydrated.current) return;
    saveRecentDialog([
      ...otherRecent.current,
      ...messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        pinyin: m.pinyin,
        translation: m.translation,
        vocab: m.vocab,
        lang: goalLang.code,
        inputLang: inputLang.code,
        createdAt: m.createdAt,
      })),
    ]);
  }, [messages, goalLang.code, inputLang.code]);

  function togglePin(m: Msg) {
    setPins((prev) => {
      const has = prev.some((p) => p.id === m.id);
      const next = has
        ? prev.filter((p) => p.id !== m.id)
        : [
            ...prev,
            {
              id: m.id,
              role: m.role,
              text: m.text,
              pinyin: m.pinyin,
              translation: m.translation,
              vocab: m.vocab,
              lang: goalLang.code,
              inputLang: inputLang.code,
              createdAt: m.createdAt,
            },
          ];
      savePinned(next);
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isPaywallActive(settings.isPro)) {
        if (active) setQuotaLeft(null);
        return;
      }
      const used = await usageInLastHour();
      if (active) setQuotaLeft(Math.max(0, FREE_PER_HOUR - used));
    })();
    return () => {
      active = false;
    };
  }, [settings.isPro, messages.length]);

  function newId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // Newest-first puts the latest card at the top, so "scroll to the new one"
  // means the opposite end of the list.
  function scrollToNewest() {
    requestAnimationFrame(() =>
      settings.dialogSort === 'desc'
        ? scrollRef.current?.scrollTo({ y: 0, animated: true })
        : scrollRef.current?.scrollToEnd({ animated: true })
    );
  }

  // Always chronological, whatever the display order — and restored cards are
  // included, which is what lets a relaunch continue the conversation.
  function toHistory(msgs: Msg[]): ChatTurn[] {
    return [...msgs]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      }));
  }

  function cancel() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    breakdownAbortRef.current?.abort();
    setBusy(null);
  }

  async function askAI(history: ChatTurn[]) {
    setError(null);
    // Free-tier rate limit (Release builds, non-Pro users only).
    if (isPaywallActive(settings.isPro) && (await usageInLastHour()) >= FREE_PER_HOUR) {
      setShowPaywall(true);
      setBusy(null);
      return;
    }
    setBusy(t('dialog.thinking'));
    abortRef.current = new AbortController();
    cancelledRef.current = false;
    try {
      const reply: DialogReply = await chatWithAI(
        settings.openaiKey,
        goalLang,
        inputLang,
        mode,
        history,
        wantPinyin,
        abortRef.current.signal
      );
      const aiMsg: Msg = {
        id: newId(),
        role: 'ai',
        createdAt: Date.now(),
        text: reply.target,
        pinyin: reply.pinyin,
        translation: reply.translation,
        vocab: reply.vocab,
      };
      setMessages((prev) => [...prev, aiMsg]);
      await recordUsage();
      scrollToNewest();
    } catch (e: any) {
      if (cancelledRef.current) {
        // User cancelled — clear silently, no error.
      } else {
        setError(e.message ?? t('dialog.errorDialog'));
      }
    } finally {
      setBusy(null);
    }
  }

  async function startConversation() {
    // Keep the restored cards visible — only the live turns reset. Their
    // history goes to the model too, so this resumes where you left off rather
    // than greeting you from scratch.
    const kept = messages.filter((m) => m.restored);
    setMessages(kept);
    await askAI(toHistory(kept));
  }

  async function onMicPress() {
    setError(null);
    if (recorder.state === 'recording') {
      // stop → transcribe → send
      try {
        setBusy(t('dialog.processing'));
        const uri = await recorder.stop();
        if (!uri) {
          setBusy(null);
          return;
        }
        setBusy(t('dialog.transcribing'));
        abortRef.current = new AbortController();
        cancelledRef.current = false;
        const text = await transcribeAudio(
          uri,
          settings.openaiKey,
          inputLang,
          abortRef.current.signal
        );
        setBusy(null);
        if (!text) {
          setError(t('dialog.errorNoSpeech'));
          return;
        }
        await sendUserText(text);
      } catch (e: any) {
        setBusy(null);
        if (cancelledRef.current) {
          // User cancelled — clear silently, no error.
        } else {
          setError(e.message ?? t('dialog.errorTranscription'));
        }
      }
    } else {
      try {
        await recorder.start();
      } catch (e: any) {
        setError(e.message ?? t('dialog.errorRecording'));
      }
    }
  }

  async function sendUserText(text: string) {
    const userMsg: Msg = { id: newId(), role: 'user', createdAt: Date.now(), text };
    const next = [...messages, userMsg];
    setMessages(next);
    scrollToNewest();
    await askAI(toHistory(next));
  }

  async function onSendDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendUserText(text);
  }

  function saveSuggestion(s: VocabSuggestion) {
    onAddVocab([
      {
        term: s.term,
        pinyin: s.pinyin,
        translation: s.translation,
        example: s.example,
        examplePinyin: s.examplePinyin,
        exampleTranslation: s.exampleTranslation,
        lang: goalLang.code,
      },
    ]);
    setSaved((prev) => new Set(prev).add(s.term));
  }

  function saveTranscription(text: string) {
    onAddVocab([{ term: text, translation: '', lang: inputLang.code }]);
    setSaved((prev) => new Set(prev).add(text));
  }

  // Break a translated sentence into its individual words/terms so each can be
  // added to the dictionary. Runs its own request (own AbortController) so it
  // doesn't interfere with an in-flight dialogue turn.
  async function breakdown(text: string): Promise<VocabSuggestion[]> {
    const ctrl = new AbortController();
    breakdownAbortRef.current = ctrl;
    cancelledRef.current = false;
    setBusy(t('dialog.breakdownLoading'));
    try {
      return await breakdownSentence(
        settings.openaiKey,
        text,
        goalLang,
        inputLang,
        wantPinyin,
        ctrl.signal
      );
    } finally {
      breakdownAbortRef.current = null;
      setBusy(null);
    }
  }

  // Save several dissected words at once ("add all").
  function saveMany(items: VocabSuggestion[]) {
    const fresh = items.filter((s) => !saved.has(s.term));
    if (fresh.length === 0) return;
    onAddVocab(
      fresh.map((s) => ({
        term: s.term,
        pinyin: s.pinyin,
        translation: s.translation,
        lang: goalLang.code,
      }))
    );
    setSaved((prev) => {
      const next = new Set(prev);
      fresh.forEach((s) => next.add(s.term));
      return next;
    });
  }

  const recording = recorder.state === 'recording';
  const disabled = busy !== null;
  // Card order is a persisted preference: oldest first reads like a transcript,
  // newest first puts the latest reply under your thumb without scrolling.
  const shown = [...messages].sort((a, b) =>
    settings.dialogSort === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Mode + language bar */}
      <View style={styles.topBar}>
        <View style={styles.segment}>
          <SegBtn
            icon="swap-horizontal-outline"
            label={t('dialog.modeFree')}
            active={mode === 'free'}
            onPress={() => setMode('free')}
          />
          <SegBtn
            icon="school-outline"
            label={t('dialog.modeAsk')}
            active={mode === 'ask'}
            onPress={() => setMode('ask')}
          />
        </View>
        <Pressable
          style={styles.quotaChip}
          onPress={() => setDialogSort(settings.dialogSort === 'asc' ? 'desc' : 'asc')}
          hitSlop={6}
          accessibilityLabel={t(
            settings.dialogSort === 'asc' ? 'dialog.sortAsc' : 'dialog.sortDesc'
          )}
        >
          <Ionicons
            name={settings.dialogSort === 'asc' ? 'arrow-down' : 'arrow-up'}
            size={14}
            color={theme.colors.accent}
          />
        </Pressable>
        <View style={styles.quotaChip}>
          <Ionicons name="flash-outline" size={13} color={theme.colors.accent} />
          <Text style={styles.quotaText}>
            {quotaLeft === null ? '∞' : `${quotaLeft}/${FREE_PER_HOUR}`}
          </Text>
        </View>
      </View>

      <View style={styles.langBar}>
        <Pressable
          style={[styles.langChip, openMenu === 'input' && styles.langChipOpen]}
          onPress={() => setOpenMenu((m) => (m === 'input' ? null : 'input'))}
        >
          <Ionicons name="mic-outline" size={14} color={theme.colors.accent2} />
          <Text style={styles.langChipText} numberOfLines={1}>
            {inputLang.nativeName}
          </Text>
          <Ionicons
            name={openMenu === 'input' ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={theme.colors.textMuted}
          />
        </Pressable>
        <Pressable
          style={styles.swapBtn}
          onPress={onSwapLanguages}
          hitSlop={6}
          accessibilityLabel={t('dialog.swap')}
        >
          <Ionicons name="swap-horizontal" size={17} color={theme.colors.accent} />
        </Pressable>
        <Pressable
          style={[styles.langChip, openMenu === 'goal' && styles.langChipOpen]}
          onPress={() => setOpenMenu((m) => (m === 'goal' ? null : 'goal'))}
        >
          <Ionicons name="school-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.langChipText} numberOfLines={1}>
            {goalLang.nativeName}
          </Text>
          <Ionicons
            name={openMenu === 'goal' ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={theme.colors.textMuted}
          />
        </Pressable>
      </View>

      <LanguagePicker
        visible={openMenu !== null}
        title={openMenu === 'input' ? t('dialog.iSpeak') : t('dialog.iLearn')}
        selectedCode={openMenu === 'input' ? inputLang.code : goalLang.code}
        // "I speak": every language with saved content. Goal: only the goal
        // languages that have content paired with the current input language.
        priorityCodes={openMenu === 'input' ? contentLangCodes : goalContentCodes}
        onSelect={(code) =>
          openMenu === 'input' ? onChangeInputLanguage(code) : onChangeGoalLanguage(code)
        }
        onClose={() => setOpenMenu(null)}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.every((m) => m.restored) && (
          // No live conversation yet. With restored pinned cards present, a
          // compact variant keeps the start button reachable without the hero.
          <View style={[styles.empty, messages.length > 0 && styles.emptyCompact]}>
            {messages.length === 0 && (
              <>
                <Ionicons name="mic-outline" size={56} color={theme.colors.accent} />
                <Text style={styles.emptyTitle}>{t('dialog.readyTitle')}</Text>
              </>
            )}
            <Text style={styles.emptyText}>
              {mode === 'ask'
                ? t('dialog.readyAsk', { goal: goalLang.nativeName, input: inputLang.nativeName })
                : t('dialog.readyFree', { goal: goalLang.nativeName })}
            </Text>
            <Pressable style={styles.startBtn} onPress={startConversation} disabled={disabled}>
              <Text style={styles.startBtnText}>{t('dialog.startConversation')}</Text>
            </Pressable>
          </View>
        )}

        {shown.map((m) =>
          m.role === 'ai' ? (
            <AiBubble
              key={m.id}
              msg={m}
              onSaveVocab={saveSuggestion}
              onSaveMany={saveMany}
              onBreakdown={breakdown}
              saved={saved}
              langCode={goalLang.code}
              onAddPhrase={onAddPhrase}
              onUpdatePhrase={onUpdatePhrase}
              tagSuggestions={tagSuggestions}
              openaiKey={settings.openaiKey}
              onSetPinyin={(pinyin) =>
                setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, pinyin } : x)))
              }
              pinned={pinnedIds.has(m.id)}
              onTogglePin={() => togglePin(m)}
            />
          ) : (
            <UserBubble
              key={m.id}
              msg={m}
              onSave={saveTranscription}
              saved={saved.has(m.text)}
              pinned={pinnedIds.has(m.id)}
              onTogglePin={() => togglePin(m)}
              speakLocale={mode === 'free' ? speechLocale(goalLang) : undefined}
            />
          )
        )}

        {error && (
          <View style={styles.errorRow}>
            <Ionicons name="warning-outline" size={15} color={theme.colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder={t('dialog.inputPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSendDraft}
          returnKeyType="send"
          editable={!disabled}
        />
        {draft.trim() ? (
          <Pressable style={styles.sendBtn} onPress={onSendDraft} disabled={disabled}>
            <Ionicons name="paper-plane" size={20} color="#001b1f" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.micBtn, recording && styles.micBtnActive]}
            onPress={onMicPress}
            disabled={disabled}
          >
            <Ionicons name={recording ? 'stop' : 'mic'} size={22} color="#fff" />
          </Pressable>
        )}
      </View>
      {recording && (
        <View style={styles.recHintRow}>
          <Ionicons name="ellipse" size={9} color={theme.colors.danger} />
          <Text style={styles.recHint}>{t('dialog.recHint')}</Text>
        </View>
      )}

      <BusyOverlay visible={!!busy} label={busy} onCancel={cancel} />

      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={() => {
          onPurchasePro();
          setShowPaywall(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function SegBtn({
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
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? '#fff' : theme.colors.textMuted} />
      <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function AiBubble({
  msg,
  onSaveVocab,
  onSaveMany,
  onBreakdown,
  saved,
  langCode,
  onAddPhrase,
  onUpdatePhrase,
  tagSuggestions,
  openaiKey,
  onSetPinyin,
  pinned,
  onTogglePin,
}: {
  msg: Msg;
  onSaveVocab: (s: VocabSuggestion) => void;
  onSaveMany: (items: VocabSuggestion[]) => void;
  onBreakdown: (text: string) => Promise<VocabSuggestion[]>;
  saved: Set<string>;
  langCode: string;
  onAddPhrase: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onUpdatePhrase: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
  openaiKey: string;
  onSetPinyin: (pinyin: string) => void;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  // Word-by-word breakdown state (lazy: only fetched when the user asks).
  const [words, setWords] = useState<VocabSuggestion[] | null>(null);
  const [breaking, setBreaking] = useState(false);
  const [breakError, setBreakError] = useState<string | null>(null);
  const [fetchingPinyin, setFetchingPinyin] = useState(false);
  // A reply can arrive without a reading (older messages, or the model simply
  // omitted it) — offer to fetch it here, the same way the phrase row does.
  const canPinyin = !!findLanguage(langCode).romanize;

  async function fillPinyin() {
    if (fetchingPinyin) return;
    setFetchingPinyin(true);
    try {
      onSetPinyin(await transliterate(openaiKey, msg.text, findLanguage(langCode)));
    } catch (e: any) {
      Alert.alert(t('vocab.makePinyin'), e?.message ?? String(e));
    } finally {
      setFetchingPinyin(false);
    }
  }

  async function runBreakdown() {
    if (breaking) return;
    setBreakError(null);
    setBreaking(true);
    try {
      setWords(await onBreakdown(msg.text));
    } catch (e: any) {
      setBreakError(e?.message ?? t('dialog.breakdownError'));
    } finally {
      setBreaking(false);
    }
  }

  function savePhrase() {
    const id = onAddPhrase({
      target: msg.text,
      pinyin: msg.pinyin,
      translation: msg.translation ?? '',
      lang: langCode,
      tags: [],
    });
    setPhraseId(id);
  }

  function toggleTag(tag: string) {
    if (!phraseId) return;
    const has = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    const next = has ? tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...tags, tag];
    setTags(next);
    onUpdatePhrase(phraseId, { tags: next });
  }

  function addCustomTag() {
    const tag = tagDraft.trim();
    setTagDraft('');
    setShowTagInput(false);
    if (!tag || !phraseId) return;
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    const next = [...tags, tag];
    setTags(next);
    onUpdatePhrase(phraseId, { tags: next });
  }

  // Merge already-applied tags with suggestions for the chip row (dedup).
  const chipTags = [...tags];
  for (const s of tagSuggestions) {
    if (!chipTags.some((t) => t.toLowerCase() === s.toLowerCase())) chipTags.push(s);
  }

  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      <View style={styles.bubbleHeader}>
        <Text style={styles.aiLabel}>{t('bubble.parla')}</Text>
        <View style={styles.bubbleActions}>
          {/* Read the reply aloud in the goal language — same device TTS the
              Vocabulary and Phrases rows use. */}
          <SpeakButton
            text={msg.text}
            locale={speechLocale(findLanguage(langCode))}
            size={14}
            style={styles.bubbleSpeak}
          />
          <PinButton pinned={pinned} onPress={onTogglePin} />
        </View>
      </View>
      <Text style={styles.aiText}>{msg.text}</Text>
      {msg.pinyin ? (
        <Text style={styles.pinyin}>{msg.pinyin}</Text>
      ) : (
        canPinyin && (
          <Pressable style={styles.makePinyinBtn} onPress={fillPinyin} disabled={fetchingPinyin}>
            {fetchingPinyin ? (
              <ActivityIndicator size="small" color={theme.colors.accent2} />
            ) : (
              <Ionicons name="sparkles-outline" size={13} color={theme.colors.accent2} />
            )}
            <Text style={styles.makePinyinText}>{t('vocab.makePinyin')}</Text>
          </Pressable>
        )
      )}
      {!!msg.translation && <Text style={styles.translation}>{msg.translation}</Text>}

      {!!msg.vocab?.length && (
        <View style={styles.vocabRow}>
          {msg.vocab.map((s, i) => {
            const isSaved = saved.has(s.term);
            return (
              <Pressable
                key={`${s.term}-${i}`}
                style={[styles.vocabChip, isSaved && styles.vocabChipSaved]}
                onPress={() => !isSaved && onSaveVocab(s)}
              >
                <Text style={styles.vocabChipTerm}>{s.term}</Text>
                {!!s.pinyin && <Text style={styles.vocabChipPinyin}>{s.pinyin}</Text>}
                <Text style={styles.vocabChipTrans}>
                  {s.translation}{' '}
                  <Ionicons
                    name={isSaved ? 'checkmark' : 'add'}
                    size={12}
                    color={isSaved ? theme.colors.success : theme.colors.textMuted}
                  />
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Word-by-word: dissect the sentence so each term can be saved */}
      <View style={styles.breakdownArea}>
        {words === null ? (
          <Pressable
            style={styles.breakdownBtn}
            onPress={runBreakdown}
            disabled={breaking}
          >
            {breaking ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons name="git-branch-outline" size={16} color={theme.colors.accent} />
            )}
            <Text style={styles.breakdownBtnText}>
              {breaking ? t('dialog.breakdownLoading') : t('dialog.breakdown')}
            </Text>
          </Pressable>
        ) : (
          <View>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>{t('dialog.breakdownTitle')}</Text>
              {words.some((w) => !saved.has(w.term)) && (
                <Pressable onPress={() => onSaveMany(words)} hitSlop={6}>
                  <Text style={styles.breakdownAddAll}>{t('dialog.addAll')}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.vocabRow}>
              {words.map((w, i) => {
                const isSaved = saved.has(w.term);
                return (
                  <Pressable
                    key={`${w.term}-${i}`}
                    style={[styles.vocabChip, isSaved && styles.vocabChipSaved]}
                    onPress={() => !isSaved && onSaveVocab(w)}
                  >
                    <Text style={styles.vocabChipTerm}>{w.term}</Text>
                    {!!w.pinyin && <Text style={styles.vocabChipPinyin}>{w.pinyin}</Text>}
                    <Text style={styles.vocabChipTrans}>
                      {w.translation}{' '}
                      <Ionicons
                        name={isSaved ? 'checkmark' : 'add'}
                        size={12}
                        color={isSaved ? theme.colors.success : theme.colors.textMuted}
                      />
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        {!!breakError && (
          <Text style={styles.breakdownError}>{breakError}</Text>
        )}
      </View>

      <View style={styles.phraseArea}>
        {phraseId === null ? (
          <Pressable style={styles.phraseSaveBtn} onPress={savePhrase}>
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.phraseSaveText}>{t('dialog.savePhrase')}</Text>
          </Pressable>
        ) : (
          <View>
            <View style={styles.phraseSavedRow}>
              <Ionicons name="checkmark-circle" size={15} color={theme.colors.success} />
              <Text style={styles.phraseSavedLabel}>{t('dialog.phraseSaved')}</Text>
            </View>
            <View style={styles.tagRow}>
              {chipTags.map((tag) => {
                const on = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
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
              {showTagInput ? (
                <TextInput
                  style={styles.tagInput}
                  placeholder={t('dialog.newTag')}
                  placeholderTextColor={theme.colors.textFaint}
                  value={tagDraft}
                  onChangeText={setTagDraft}
                  onSubmitEditing={addCustomTag}
                  onBlur={addCustomTag}
                  autoFocus
                  returnKeyType="done"
                />
              ) : (
                <Pressable
                  style={[styles.tagChip, styles.tagChipAdd]}
                  onPress={() => setShowTagInput(true)}
                >
                  <Ionicons name="add" size={13} color={theme.colors.accent} />
                  <Text style={styles.tagChipAddText}>{t('dialog.tag')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function PinButton({ pinned, onPress }: { pinned: boolean; onPress: () => void }) {
  const t = useT();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityLabel={pinned ? t('dialog.unpin') : t('dialog.pin')}
    >
      <Ionicons
        name={pinned ? 'pin' : 'pin-outline'}
        size={16}
        color={pinned ? theme.colors.accent : theme.colors.textFaint}
      />
    </Pressable>
  );
}

function UserBubble({
  msg,
  onSave,
  saved,
  pinned,
  onTogglePin,
  speakLocale,
}: {
  msg: Msg;
  onSave: (text: string) => void;
  saved: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  /** Set only when the learner's own text is in the goal language (free mode) —
      hearing your own native sentence back is noise. */
  speakLocale?: string;
}) {
  const t = useT();
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={[styles.bubble, styles.userBubble]}>
      <View style={styles.bubbleHeader}>
        <View style={styles.bubbleActions}>
          <PinButton pinned={pinned} onPress={onTogglePin} />
          {!!speakLocale && (
            <SpeakButton
              text={msg.text}
              locale={speakLocale}
              size={14}
              style={styles.bubbleSpeak}
            />
          )}
        </View>
        <Text style={styles.userLabel}>{t('bubble.you')}</Text>
      </View>
      <Text style={styles.userText}>{msg.text}</Text>
      <Pressable
        onPress={() => !saved && onSave(msg.text)}
        hitSlop={8}
        style={styles.userSaveRow}
      >
        <Ionicons
          name={saved ? 'checkmark' : 'add'}
          size={13}
          color={saved ? theme.colors.success : theme.colors.accent2}
        />
        <Text style={[styles.userSave, saved && styles.userSaveDone]}>
          {saved ? t('dialog.inVocab') : t('dialog.toVocab')}
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  quotaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accentDim,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quotaText: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  segment: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  segBtnActive: { backgroundColor: theme.colors.accent },
  segBtnText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  segBtnTextActive: { color: '#fff' },
  langBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  langChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  langChipOpen: { borderColor: theme.colors.accent },
  swapBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentDim,
  },
  langChipText: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24, gap: 12 },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  emptyCompact: { paddingTop: 4, paddingBottom: 8 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  startBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  bubble: { borderRadius: theme.radius.md, padding: 14, maxWidth: '92%' },
  aiBubble: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: theme.colors.accent2Dim,
    borderWidth: 1,
    borderColor: theme.colors.accent2,
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  bubbleActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Shrinks SpeakButton's default 38pt disc to something that sits in a header row.
  bubbleSpeak: { width: 28, height: 28 },
  aiLabel: { color: theme.colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  userLabel: {
    color: theme.colors.accent2,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'right',
  },
  aiText: { color: theme.colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  pinyin: { color: theme.colors.accent2, fontSize: 14, marginTop: 4, fontWeight: '500' },
  makePinyinBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.accent2,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  makePinyinText: { color: theme.colors.accent2, fontWeight: '800', fontSize: 11 },
  translation: { color: theme.colors.textMuted, fontSize: 14, marginTop: 6, fontStyle: 'italic' },
  userText: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
  userSaveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 8 },
  userSave: { color: theme.colors.accent2, fontSize: 12, fontWeight: '700' },
  userSaveDone: { color: theme.colors.success },

  vocabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
  },
  vocabChip: {
    backgroundColor: theme.colors.accentDim,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vocabChipSaved: { borderColor: theme.colors.success, backgroundColor: '#34D39922' },
  vocabChipTerm: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  vocabChipPinyin: { color: theme.colors.accent2, fontSize: 10, marginTop: 1 },
  vocabChipTrans: { color: theme.colors.textMuted, fontSize: 11, marginTop: 1 },

  breakdownArea: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.cardBorder,
  },
  breakdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  breakdownBtnText: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  breakdownAddAll: { color: theme.colors.accent, fontSize: 12, fontWeight: '800' },
  breakdownError: { color: theme.colors.danger, fontSize: 12, marginTop: 8 },

  phraseArea: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.cardBorder,
  },
  phraseSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  phraseSaveText: { color: theme.colors.accent, fontSize: 13, fontWeight: '800' },
  phraseSavedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  phraseSavedLabel: { color: theme.colors.success, fontSize: 12, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
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

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  error: { color: theme.colors.danger, fontSize: 13, flex: 1 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: theme.colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.accent2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#001b1f', fontSize: 20, fontWeight: '900' },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: theme.colors.danger },
  recHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  recHint: { color: theme.colors.danger, fontSize: 12 },
  });
}
