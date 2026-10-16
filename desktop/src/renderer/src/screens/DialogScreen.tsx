import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Send,
  ArrowLeftRight,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  PlusCircle,
  CheckCircle2,
  Plus,
  Check,
  GitBranch,
} from 'lucide-react';
import {
  FREE_PER_HOUR,
  isPaywallActive,
  PhraseItem,
  recordUsage,
  Settings,
  usageInLastHour,
  VocabItem,
  newId,
} from '../storage';
import { findLanguage, speechLocale } from '../languages';
import { useRecorder } from '../recorder';
import { Paywall } from '../components/Paywall';
import { LanguagePicker } from '../components/LanguagePicker';
import { SpeakButton } from '../components/SpeakButton';
import { useT } from '../i18n/I18nContext';
import {
  breakdownSentence,
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
  onAddVocab: (items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) => void;
  onAddPhrase: (p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>) => string;
  onUpdatePhrase: (id: string, patch: Partial<PhraseItem>) => void;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  onSwapLanguages: () => void;
  onSetShowPinyin: (value: boolean) => void;
  onPurchasePro: () => void;
  contentLangCodes: string[]; // languages with saved content — shown on top of the input picker
  tagSuggestions: string[];
};

export function DialogScreen({
  settings,
  contentLangCodes,
  onAddVocab,
  onAddPhrase,
  onUpdatePhrase,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  onSwapLanguages,
  onSetShowPinyin,
  onPurchasePro,
  tagSuggestions,
}: Props) {
  const t = useT();
  const goalLang = findLanguage(settings.goalLanguage);
  const inputLang = findLanguage(settings.inputLanguage);
  // Goal languages the learner has content in together with the current input
  // language — the goal picker surfaces these under "Existing content".
  const goalContentCodes = Array.from(
    new Set(settings.recentPairs.filter((p) => p.input === inputLang.code).map((p) => p.goal))
  );
  const wantPinyin = !!goalLang.romanize && settings.showPinyin;
  const [mode, setMode] = useState<Mode>(settings.defaultMode === 'ask' ? 'ask' : 'free');
  const [openMenu, setOpenMenu] = useState<'input' | 'goal' | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function toHistory(msgs: Msg[]): ChatTurn[] {
    return msgs.map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
  }

  function cancel() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setBusy(null);
  }

  async function askAI(history: ChatTurn[]) {
    setError(null);
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
      if (!cancelledRef.current) setError(e.message ?? t('dialog.errorDialog'));
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
      try {
        setBusy(t('dialog.processing'));
        const blob = await recorder.stop();
        if (!blob) {
          setBusy(null);
          return;
        }
        setBusy(t('dialog.transcribing'));
        abortRef.current = new AbortController();
        cancelledRef.current = false;
        const text = await transcribeAudio(
          blob,
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
        if (!cancelledRef.current) setError(e.message ?? t('dialog.errorTranscription'));
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
    return breakdownSentence(
      settings.openaiKey,
      text,
      goalLang,
      inputLang,
      wantPinyin,
      ctrl.signal
    );
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

  return (
    <div className="screen">
      {/* Mode + quota bar */}
      <div className="topbar row">
        <div className="segment">
          <button
            className={`seg-btn${mode === 'free' ? ' active' : ''}`}
            onClick={() => setMode('free')}
          >
            <ArrowLeftRight size={15} />
            {t('dialog.modeFree')}
          </button>
          <button
            className={`seg-btn${mode === 'ask' ? ' active' : ''}`}
            onClick={() => setMode('ask')}
          >
            <GraduationCap size={15} />
            {t('dialog.modeAsk')}
          </button>
        </div>
        <div className="quota-chip">
          <Zap size={13} />
          {quotaLeft === null ? '∞' : `${quotaLeft}/${FREE_PER_HOUR}`}
        </div>
      </div>

      {/* Language bar */}
      <div className="langbar">
        <button
          className={`chip flex${openMenu === 'input' ? ' open' : ''}`}
          onClick={() => setOpenMenu((m) => (m === 'input' ? null : 'input'))}
        >
          <Mic size={14} className="ink2" />
          <span className="name">{inputLang.nativeName}</span>
          {openMenu === 'input' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <button className="swap-btn" onClick={onSwapLanguages} aria-label={t('dialog.swap')}>
          <ArrowLeftRight size={17} />
        </button>
        <button
          className={`chip flex${openMenu === 'goal' ? ' open' : ''}`}
          onClick={() => setOpenMenu((m) => (m === 'goal' ? null : 'goal'))}
        >
          <GraduationCap size={14} className="ink" />
          <span className="name">{goalLang.nativeName}</span>
          {openMenu === 'goal' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {goalLang.romanize && (
          <button
            className={`pinyin-toggle${settings.showPinyin ? ' on' : ''}`}
            onClick={() => onSetShowPinyin(!settings.showPinyin)}
            aria-label={t('dialog.romanize')}
          >
            Aa
          </button>
        )}
      </div>

      <LanguagePicker
        visible={openMenu !== null}
        title={openMenu === 'input' ? t('dialog.iSpeak') : t('dialog.iLearn')}
        selectedCode={openMenu === 'input' ? inputLang.code : goalLang.code}
        onSelect={(code) =>
          openMenu === 'input' ? onChangeInputLanguage(code) : onChangeGoalLanguage(code)
        }
        priorityCodes={openMenu === 'input' ? contentLangCodes : goalContentCodes}
        onClose={() => setOpenMenu(null)}
      />

      {/* Messages */}
      <div className="scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <Mic size={56} className="ink" />
            <h2>{t('dialog.readyTitle')}</h2>
            <p>
              {mode === 'ask'
                ? t('dialog.readyAsk', { goal: goalLang.nativeName, input: inputLang.nativeName })
                : t('dialog.readyFree', { goal: goalLang.nativeName })}
            </p>
            <button className="start-btn" onClick={startConversation} disabled={disabled}>
              {t('dialog.startConversation')}
            </button>
          </div>
        )}

        {messages.map((m) =>
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
            />
          ) : (
            <UserBubble
              key={m.id}
              msg={m}
              onSave={saveTranscription}
              saved={saved.has(m.text)}
              speakLocale={mode === 'free' ? speechLocale(goalLang) : undefined}
            />
          )
        )}

        {busy && (
          <div className="busy">
            <span className="spinner" />
            <span className="busy-text">{busy}</span>
            <button className="cancel-btn" onClick={cancel}>
              {t('common.cancel')}
            </button>
          </div>
        )}
        {error && (
          <div className="error-row">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="inputbar">
        <input
          className="textinput"
          placeholder={t('dialog.inputPlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSendDraft()}
          disabled={disabled}
        />
        {draft.trim() ? (
          <button className="iconbtn send" onClick={onSendDraft} disabled={disabled}>
            <Send size={20} />
          </button>
        ) : (
          <button
            className={`iconbtn mic${recording ? ' rec' : ''}`}
            onClick={onMicPress}
            disabled={disabled}
          >
            {recording ? <Square size={22} /> : <Mic size={22} />}
          </button>
        )}
      </div>
      {recording && <div className="rec-hint">● {t('dialog.recHint')}</div>}

      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={() => {
          onPurchasePro();
          setShowPaywall(false);
        }}
      />
    </div>
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
}) {
  const t = useT();
  const [phraseId, setPhraseId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  // Word-by-word breakdown state (lazy: only fetched when the user asks).
  const [words, setWords] = useState<VocabSuggestion[] | null>(null);
  const [breaking, setBreaking] = useState(false);
  const [breakError, setBreakError] = useState<string | null>(null);

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
    const has = tags.some((x) => x.toLowerCase() === tag.toLowerCase());
    const next = has ? tags.filter((x) => x.toLowerCase() !== tag.toLowerCase()) : [...tags, tag];
    setTags(next);
    onUpdatePhrase(phraseId, { tags: next });
  }

  function addCustomTag() {
    const tag = tagDraft.trim();
    setTagDraft('');
    setShowTagInput(false);
    if (!tag || !phraseId) return;
    if (tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return;
    const next = [...tags, tag];
    setTags(next);
    onUpdatePhrase(phraseId, { tags: next });
  }

  const chipTags = [...tags];
  for (const s of tagSuggestions) {
    if (!chipTags.some((x) => x.toLowerCase() === s.toLowerCase())) chipTags.push(s);
  }

  return (
    <div className="bubble ai">
      <div className="b-head">
        <div className="b-label ai">{t('bubble.parla')}</div>
        {/* Read the reply aloud in the goal language — same TTS the Phrases
            rows use. */}
        <SpeakButton
          text={msg.text}
          locale={speechLocale(findLanguage(langCode))}
          size={14}
          className="b-speak"
        />
      </div>
      <div className="b-target">{msg.text}</div>
      {!!msg.pinyin && <div className="b-pinyin">{msg.pinyin}</div>}
      {!!msg.translation && <div className="b-trans">{msg.translation}</div>}

      {!!msg.vocab?.length && (
        <div className="vocab-row">
          {msg.vocab.map((s, i) => {
            const isSaved = saved.has(s.term);
            return (
              <button
                key={`${s.term}-${i}`}
                className={`vchip${isSaved ? ' saved' : ''}`}
                onClick={() => !isSaved && onSaveVocab(s)}
              >
                <span className="term">{s.term}</span>
                <span className="vt">
                  {s.translation} {isSaved ? <Check size={12} /> : <Plus size={12} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Word-by-word: dissect the sentence so each term can be saved */}
      <div className="breakdown-area">
        {words === null ? (
          <button className="link-btn ink" onClick={runBreakdown} disabled={breaking}>
            {breaking ? <span className="spinner" /> : <GitBranch size={16} />}
            {breaking ? t('dialog.breakdownLoading') : t('dialog.breakdown')}
          </button>
        ) : (
          <div>
            <div className="breakdown-head">
              <span className="breakdown-label">{t('dialog.breakdownTitle')}</span>
              {words.some((w) => !saved.has(w.term)) && (
                <button className="breakdown-addall" onClick={() => onSaveMany(words)}>
                  {t('dialog.addAll')}
                </button>
              )}
            </div>
            <div className="vocab-row">
              {words.map((w, i) => {
                const isSaved = saved.has(w.term);
                return (
                  <button
                    key={`${w.term}-${i}`}
                    className={`vchip${isSaved ? ' saved' : ''}`}
                    onClick={() => !isSaved && onSaveVocab(w)}
                  >
                    <span className="term">{w.term}</span>
                    {!!w.pinyin && <span className="vchip-pinyin">{w.pinyin}</span>}
                    <span className="vt">
                      {w.translation} {isSaved ? <Check size={12} /> : <Plus size={12} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!!breakError && <div className="breakdown-error">{breakError}</div>}
      </div>

      <div className="tagarea">
        {phraseId === null ? (
          <button className="link-btn ink" onClick={savePhrase}>
            <PlusCircle size={16} /> {t('dialog.savePhrase')}
          </button>
        ) : (
          <div>
            <div className="phrase-saved">
              <CheckCircle2 size={15} /> {t('dialog.phraseSaved')}
            </div>
            <div className="tagrow">
              {chipTags.map((tag) => {
                const on = tags.some((x) => x.toLowerCase() === tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    className={`tag${on ? ' on' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {on && <Check size={12} />}
                    {tag}
                  </button>
                );
              })}
              {showTagInput ? (
                <input
                  className="tag-input"
                  autoFocus
                  placeholder={t('dialog.newTag')}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                  onBlur={addCustomTag}
                />
              ) : (
                <button className="tag add" onClick={() => setShowTagInput(true)}>
                  <Plus size={13} /> {t('dialog.tag')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({
  msg,
  onSave,
  saved,
  speakLocale,
}: {
  msg: Msg;
  onSave: (text: string) => void;
  saved: boolean;
  /** Set only when the learner's own text is in the goal language (free mode) —
      hearing your own native sentence back is noise. */
  speakLocale?: string;
}) {
  const t = useT();
  return (
    <div className="bubble user">
      <div className="b-head">
        {!!speakLocale && (
          <SpeakButton text={msg.text} locale={speakLocale} size={14} className="b-speak" />
        )}
        <div className="b-label user">{t('bubble.you')}</div>
      </div>
      <div className="b-user-text">{msg.text}</div>
      <button
        className={`user-save${saved ? ' done' : ''}`}
        onClick={() => !saved && onSave(msg.text)}
      >
        {saved ? <Check size={13} /> : <Plus size={13} />}
        {saved ? t('dialog.inVocab') : t('dialog.toVocab')}
      </button>
    </div>
  );
}
