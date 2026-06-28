import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { theme } from '../theme';
import {
  FREE_PER_HOUR,
  isPaywallActive,
  PhraseItem,
  recordUsage,
  Settings,
  usageInLastHour,
  VocabItem,
} from '../storage';
import { findLanguage, LANGUAGES } from '../languages';
import { useRecorder } from '../useRecorder';
import { Paywall } from '../components/Paywall';
import { useT } from '../i18n/I18nContext';
import {
  chatWithAI,
  ChatTurn,
  DialogReply,
  transcribeAudio,
  VocabSuggestion,
} from '../api';

type Mode = 'ask' | 'free';

type Msg = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  pinyin?: string;
  translation?: string;
  vocab?: VocabSuggestion[];
};

type Props = {
  settings: Settings;
  onAddVocab: (items: Omit<VocabItem, 'id' | 'createdAt'>[]) => void;
  onAddPhrase: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onUpdatePhrase: (id: string, patch: Partial<PhraseItem>) => void;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  onSetShowPinyin: (value: boolean) => void;
  onPurchasePro: () => void;
  tagSuggestions: string[];
};

export function DialogScreen({
  settings,
  onAddVocab,
  onAddPhrase,
  onUpdatePhrase,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  onSetShowPinyin,
  onPurchasePro,
  tagSuggestions,
}: Props) {
  const t = useT();
  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  const wantPinyin = !!goalLang.romanize && settings.showPinyin;
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
  const cancelledRef = useRef(false);
  const recorder = useRecorder();
  // Remaining free-tier quota this hour; null = unlimited (dev env or Pro).
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);

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

  function scrollToEnd() {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  function toHistory(msgs: Msg[]): ChatTurn[] {
    return msgs.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    }));
  }

  function cancel() {
    cancelledRef.current = true;
    abortRef.current?.abort();
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
        text: reply.target,
        pinyin: reply.pinyin,
        translation: reply.translation,
        vocab: reply.vocab,
      };
      setMessages((prev) => [...prev, aiMsg]);
      await recordUsage();
      scrollToEnd();
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
    setMessages([]);
    await askAI([]);
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
    const userMsg: Msg = { id: newId(), role: 'user', text };
    const next = [...messages, userMsg];
    setMessages(next);
    scrollToEnd();
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
        lang: goalLang.code,
      },
    ]);
    setSaved((prev) => new Set(prev).add(s.term));
  }

  function saveTranscription(text: string) {
    onAddVocab([{ term: text, translation: '', lang: inputLang.code }]);
    setSaved((prev) => new Set(prev).add(text));
  }

  const recording = recorder.state === 'recording';
  const disabled = busy !== null;

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
        <Ionicons name="arrow-forward" size={15} color={theme.colors.textFaint} />
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
        {goalLang.romanize && (
          <Pressable
            style={[styles.pinyinToggle, settings.showPinyin && styles.pinyinToggleOn]}
            onPress={() => onSetShowPinyin(!settings.showPinyin)}
          >
            <Text
              style={[styles.pinyinToggleText, settings.showPinyin && styles.pinyinToggleTextOn]}
            >
              拼
            </Text>
          </Pressable>
        )}
      </View>

      {openMenu && (
        <View style={styles.langMenu}>
          <Text style={styles.langMenuTitle}>
            {openMenu === 'input' ? t('dialog.iSpeak') : t('dialog.iLearn')}
          </Text>
          {LANGUAGES.map((l) => {
            const current = openMenu === 'input' ? inputLang.code : goalLang.code;
            const active = l.code === current;
            return (
              <Pressable
                key={l.code}
                style={[styles.langOption, active && styles.langOptionActive]}
                onPress={() => {
                  if (openMenu === 'input') onChangeInputLanguage(l.code);
                  else onChangeGoalLanguage(l.code);
                  setOpenMenu(null);
                }}
              >
                <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                  {l.nativeName}
                </Text>
                <View style={styles.langOptionSub} />
                {active && <Ionicons name="checkmark" size={15} color={theme.colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="mic-outline" size={56} color={theme.colors.accent} />
            <Text style={styles.emptyTitle}>{t('dialog.readyTitle')}</Text>
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

        {messages.map((m) =>
          m.role === 'ai' ? (
            <AiBubble
              key={m.id}
              msg={m}
              onSaveVocab={saveSuggestion}
              saved={saved}
              langCode={goalLang.code}
              onAddPhrase={onAddPhrase}
              onUpdatePhrase={onUpdatePhrase}
              tagSuggestions={tagSuggestions}
            />
          ) : (
            <UserBubble key={m.id} msg={m} onSave={saveTranscription} saved={saved.has(m.text)} />
          )
        )}

        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.busyText}>{busy}</Text>
            <Pressable style={styles.cancelBtn} onPress={cancel}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
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
  saved,
  langCode,
  onAddPhrase,
  onUpdatePhrase,
  tagSuggestions,
}: {
  msg: Msg;
  onSaveVocab: (s: VocabSuggestion) => void;
  saved: Set<string>;
  langCode: string;
  onAddPhrase: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onUpdatePhrase: (id: string, patch: Partial<PhraseItem>) => void;
  tagSuggestions: string[];
}) {
  const t = useT();
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

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
      <Text style={styles.aiLabel}>{t('bubble.parla')}</Text>
      <Text style={styles.aiText}>{msg.text}</Text>
      {!!msg.pinyin && <Text style={styles.pinyin}>{msg.pinyin}</Text>}
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

function UserBubble({
  msg,
  onSave,
  saved,
}: {
  msg: Msg;
  onSave: (text: string) => void;
  saved: boolean;
}) {
  const t = useT();
  return (
    <View style={[styles.bubble, styles.userBubble]}>
      <Text style={styles.userLabel}>{t('bubble.you')}</Text>
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

const styles = StyleSheet.create({
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
  pinyinToggle: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  pinyinToggleOn: { borderColor: theme.colors.accent2, backgroundColor: theme.colors.accent2Dim },
  pinyinToggleText: { color: theme.colors.textFaint, fontSize: 16, fontWeight: '800' },
  pinyinToggleTextOn: { color: theme.colors.accent2 },
  langChipText: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  langMenuTitle: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  langMenu: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.cardBorder,
  },
  langOptionActive: { backgroundColor: theme.colors.accentDim },
  langOptionText: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  langOptionTextActive: { color: theme.colors.accent },
  langOptionSub: { color: theme.colors.textFaint, fontSize: 12, flex: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24, gap: 12 },

  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
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
  aiLabel: { color: theme.colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  userLabel: {
    color: theme.colors.accent2,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'right',
  },
  aiText: { color: theme.colors.text, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  pinyin: { color: theme.colors.accent2, fontSize: 14, marginTop: 4, fontWeight: '500' },
  translation: { color: theme.colors.textMuted, fontSize: 14, marginTop: 6, fontStyle: 'italic' },
  userText: { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
  userSaveRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 8 },
  userSave: { color: theme.colors.accent2, fontSize: 12, fontWeight: '700' },
  userSaveDone: { color: theme.colors.success },

  vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
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
  vocabChipTrans: { color: theme.colors.textMuted, fontSize: 11, marginTop: 1 },

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

  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  busyText: { color: theme.colors.textMuted, fontSize: 13, flex: 1 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: theme.colors.bgElevated,
  },
  cancelBtnText: { color: theme.colors.danger, fontSize: 13, fontWeight: '700' },
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
