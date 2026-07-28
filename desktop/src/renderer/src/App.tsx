import { useEffect, useMemo, useState } from 'react';
import {
  MessagesSquare,
  BookOpen,
  Bookmark,
  Settings as SettingsIcon,
  AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  loadPhrases,
  loadSettings,
  loadVocab,
  PhraseItem,
  recentTags,
  savePhrases,
  saveSettings,
  saveVocab,
  Settings,
  VocabItem,
  newId,
  addLearnLanguage,
  rememberPair,
  contentLanguages,
} from './storage';
import { PairMenu } from './components/PairMenu';
import { DialogScreen } from './screens/DialogScreen';
import { VocabScreen } from './screens/VocabScreen';
import { PhraseScreen } from './screens/PhraseScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { EmergencyScreen } from './screens/EmergencyScreen';
import { I18nProvider } from './i18n/I18nContext';
import { makeT, resolveUiLang } from './i18n';
import { applyThemeMode, resolveThemeMode } from './theme';

type Tab = 'dialog' | 'vocab' | 'phrases' | 'settings';

const TABS: { key: Tab; Icon: LucideIcon }[] = [
  { key: 'dialog', Icon: MessagesSquare },
  { key: 'vocab', Icon: BookOpen },
  { key: 'phrases', Icon: Bookmark },
  { key: 'settings', Icon: SettingsIcon },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('dialog');
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [phrases, setPhrases] = useState<PhraseItem[]>([]);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  );

  useEffect(() => {
    (async () => {
      const [s, v, p] = await Promise.all([loadSettings(), loadVocab(), loadPhrases()]);
      setSettings(s);
      setVocab(v);
      setPhrases(p);
      setReady(true);
    })();
  }, []);

  // Track the OS color scheme so theme='system' stays live.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Apply the resolved theme to <html> whenever the setting or OS scheme changes.
  const mode = resolveThemeMode(settings?.theme ?? 'system', systemDark);
  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  async function handleSaveSettings(next: Settings) {
    setSettings(next);
    await saveSettings(next);
  }

  function changeInputLanguage(code: string) {
    if (settings) handleSaveSettings({ ...settings, inputLanguage: code });
  }
  function changeGoalLanguage(code: string) {
    if (settings)
      handleSaveSettings({
        ...settings,
        goalLanguage: code,
        learnLanguages: addLearnLanguage(settings.learnLanguages, code),
      });
  }
  // Flip spoken (input) and learned (goal) in one write to avoid clobbering.
  function swapLanguages() {
    if (settings)
      handleSaveSettings({
        ...settings,
        inputLanguage: settings.goalLanguage,
        goalLanguage: settings.inputLanguage,
        learnLanguages: addLearnLanguage(settings.learnLanguages, settings.inputLanguage),
      });
  }
  // Switch both languages at once from the header's quick menu.
  function usePair(input: string, goal: string) {
    if (settings)
      handleSaveSettings({
        ...settings,
        inputLanguage: input,
        goalLanguage: goal,
        learnLanguages: addLearnLanguage(settings.learnLanguages, goal),
      });
  }
  // Settings → "Languages I learn": manual add/remove of the learn set.
  function addLearnLang(code: string) {
    if (settings)
      handleSaveSettings({
        ...settings,
        learnLanguages: addLearnLanguage(settings.learnLanguages, code),
      });
  }
  function removeLearnLang(code: string) {
    if (settings)
      handleSaveSettings({
        ...settings,
        learnLanguages: settings.learnLanguages.filter((c) => c !== code),
      });
  }
  function setEmergencyEnabled(value: boolean) {
    if (settings) handleSaveSettings({ ...settings, emergencyEnabled: value });
  }
  // Saving a word/phrase marks the current pair as one the learner actually
  // works in, so it shows up in the quick menu.
  function notePairUsed() {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        recentPairs: rememberPair(prev.recentPairs, prev.inputLanguage, prev.goalLanguage, Date.now()),
      };
      saveSettings(next);
      return next;
    });
  }
  function setShowPinyin(value: boolean) {
    if (settings) handleSaveSettings({ ...settings, showPinyin: value });
  }
  function setPro(value: boolean) {
    if (settings) handleSaveSettings({ ...settings, isPro: value });
  }
  function setUiLanguage(code: string) {
    if (settings) handleSaveSettings({ ...settings, uiLanguage: code });
  }
  function setDefaultMode(m: 'free' | 'ask') {
    if (settings) handleSaveSettings({ ...settings, defaultMode: m });
  }
  function setTheme(m: 'light' | 'dark' | 'system') {
    if (settings) handleSaveSettings({ ...settings, theme: m });
  }

  function purchasePro() {
    const t = makeT(resolveUiLang(settings?.uiLanguage ?? 'auto'));
    setPro(true);
    window.alert(`${t('alert.proTitle')}\n\n${t('alert.purchaseSimulated')}`);
  }
  function restorePurchases() {
    const t = makeT(resolveUiLang(settings?.uiLanguage ?? 'auto'));
    window.alert(
      `${t('alert.restoreTitle')}\n\n${settings?.isPro ? t('alert.alreadyPro') : t('alert.noPurchases')}`
    );
  }

  // New vocab starts untagged; tags are added later via the row tag editor.
  function addVocab(items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) {
    setVocab((prev) => {
      const existing = new Set(prev.map((v) => `${v.lang}:${v.term.toLowerCase()}`));
      const fresh = items
        .filter((i) => i.term.trim() && !existing.has(`${i.lang}:${i.term.toLowerCase()}`))
        .map((i) => ({
          ...i,
          id: newId(),
          tags: [] as string[],
          createdAt: Date.now(),
          reviews: 0,
          known: 0,
        }));
      const next = [...fresh, ...prev];
      saveVocab(next);
      if (fresh.length > 0) notePairUsed();
      return next;
    });
  }
  function updateVocab(id: string, patch: Partial<VocabItem>) {
    setVocab((prev) => {
      const next = prev.map((v) => (v.id === id ? { ...v, ...patch } : v));
      saveVocab(next);
      return next;
    });
  }
  function removeVocab(id: string) {
    setVocab((prev) => {
      const next = prev.filter((v) => v.id !== id);
      saveVocab(next);
      return next;
    });
  }

  // Returns the phrase id (existing one if it's a duplicate) so the dialog can
  // attach tags to the just-saved phrase.
  function addPhrase(p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>): string {
    const dup = phrases.find((x) => x.lang === p.lang && x.target.trim() === p.target.trim());
    if (dup) return dup.id;
    const item: PhraseItem = { ...p, id: newId(), createdAt: Date.now(), reviews: 0, known: 0 };
    const next = [item, ...phrases];
    setPhrases(next);
    savePhrases(next);
    notePairUsed();
    return item.id;
  }
  function updatePhrase(id: string, patch: Partial<PhraseItem>) {
    setPhrases((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      savePhrases(next);
      return next;
    });
  }
  function removePhrase(id: string) {
    setPhrases((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePhrases(next);
      return next;
    });
  }

  if (!ready || !settings) {
    return (
      <div className="app loading">
        <span className="logo-word">Parla</span>
        <span className="spinner big" />
      </div>
    );
  }

  const uiLang = resolveUiLang(settings.uiLanguage);
  const t = makeT(uiLang);

  return (
    <I18nProvider lang={uiLang}>
      <div className="app">
        {emergencyOpen && (
          <EmergencyScreen settings={settings} onClose={() => setEmergencyOpen(false)} />
        )}
        <div className="header">
          <div className="logo-mark">
            <span className="logo-mark-text">文</span>
            <span className="logo-dot" />
          </div>
          <div className="header-text">
            <h1 className="logo">
              Parl<span className="logo-a">a</span>
            </h1>
            <div className="tagline">{t('app.tagline').toUpperCase()}</div>
          </div>
          <div className="header-actions">
            <PairMenu
              input={settings.inputLanguage}
              goal={settings.goalLanguage}
              pairs={settings.recentPairs}
              onPick={usePair}
            />
            {settings.emergencyEnabled && (
              <button
                className="header-emergency"
                onClick={() => setEmergencyOpen(true)}
                title={t('emergency.title')}
                aria-label={t('emergency.title')}
              >
                <AlertTriangle size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="body">
          {tab === 'dialog' && (
            <DialogScreen
              settings={settings}
              onAddVocab={addVocab}
              onAddPhrase={addPhrase}
              onUpdatePhrase={updatePhrase}
              onChangeInputLanguage={changeInputLanguage}
              onChangeGoalLanguage={changeGoalLanguage}
              onSwapLanguages={swapLanguages}
              onSetShowPinyin={setShowPinyin}
              onPurchasePro={purchasePro}
              tagSuggestions={recentTags(phrases)}
            />
          )}
          {tab === 'vocab' && (
            <VocabScreen
              vocab={vocab}
              onRemove={removeVocab}
              onAdd={addVocab}
              onUpdate={updateVocab}
              tagSuggestions={recentTags(vocab)}
              settings={settings}
            />
          )}
          {tab === 'phrases' && (
            <PhraseScreen
              phrases={phrases}
              onRemove={removePhrase}
              onUpdate={updatePhrase}
              onAdd={addPhrase}
              tagSuggestions={recentTags(phrases)}
              settings={settings}
            />
          )}
          {tab === 'settings' && (
            <SettingsScreen
              settings={settings}
              onChangeInputLanguage={changeInputLanguage}
              onChangeGoalLanguage={changeGoalLanguage}
              onAddLearnLanguage={addLearnLang}
              onRemoveLearnLanguage={removeLearnLang}
              setUiLanguage={setUiLanguage}
              setDefaultMode={setDefaultMode}
              setTheme={setTheme}
              setEmergencyEnabled={setEmergencyEnabled}
              setPro={setPro}
              purchasePro={purchasePro}
              restorePurchases={restorePurchases}
            />
          )}
        </div>

        <nav className="tabbar">
          {TABS.map(({ key, Icon }) => {
            const active = key === tab;
            const badge =
              key === 'vocab' && vocab.length > 0
                ? `  ${vocab.length}`
                : key === 'phrases' && phrases.length > 0
                  ? `  ${phrases.length}`
                  : '';
            return (
              <button
                key={key}
                className={`tab${active ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                <Icon size={22} className="ic" />
                <span>
                  {t('tab.' + key)}
                  {badge}
                </span>
                {active && <span className="dot" />}
              </button>
            );
          })}
        </nav>
      </div>
    </I18nProvider>
  );
}
