import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, themeFor } from './src/theme';
import { ThemeProvider, resolveThemeMode } from './src/ThemeContext';
import {
  loadPhrases,
  loadSettings,
  loadVocab,
  PhraseItem,
  recentTags,
  rememberPair,
  savePhrases,
  saveSettings,
  saveVocab,
  Settings,
  VocabItem,
} from './src/storage';
import { DialogScreen } from './src/screens/DialogScreen';
import { VocabScreen } from './src/screens/VocabScreen';
import { PhraseScreen } from './src/screens/PhraseScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { I18nProvider } from './src/i18n/I18nContext';
import { lockPortrait } from './src/orientation';
import { PairMenu } from './src/components/PairMenu';
import { makeT, resolveUiLang } from './src/i18n';

type Tab = 'dialog' | 'vocab' | 'phrases' | 'settings';

const TABS: { key: Tab; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'dialog', icon: 'chatbubble-ellipses-outline' },
  { key: 'vocab', icon: 'book-outline' },
  { key: 'phrases', icon: 'bookmark-outline' },
  { key: 'settings', icon: 'settings-outline' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('dialog');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [phrases, setPhrases] = useState<PhraseItem[]>([]);
  const scheme = useColorScheme();

  // The app itself stays portrait; only the full-screen word card unlocks
  // rotation while it is open (see WordCard).
  useEffect(() => {
    lockPortrait();
  }, []);

  useEffect(() => {
    (async () => {
      const [s, v, p] = await Promise.all([loadSettings(), loadVocab(), loadPhrases()]);
      setSettings(s);
      setVocab(v);
      setPhrases(p);
      setReady(true);
    })();
  }, []);

  async function handleSaveSettings(next: Settings) {
    setSettings(next);
    await saveSettings(next);
  }

  function changeInputLanguage(code: string) {
    if (!settings) return;
    handleSaveSettings({ ...settings, inputLanguage: code });
  }

  function changeGoalLanguage(code: string) {
    if (!settings) return;
    handleSaveSettings({ ...settings, goalLanguage: code });
  }

  // Flip the spoken (input) and learned (goal) languages in one write — chaining
  // the two setters above would each spread the same stale `settings` and the
  // second would clobber the first.
  function swapLanguages() {
    if (!settings) return;
    handleSaveSettings({
      ...settings,
      inputLanguage: settings.goalLanguage,
      goalLanguage: settings.inputLanguage,
    });
  }

  // Switch both languages at once from the header's quick menu.
  function usePair(input: string, goal: string) {
    if (!settings) return;
    handleSaveSettings({ ...settings, inputLanguage: input, goalLanguage: goal });
  }

  // Saving a word or a phrase marks the current pair as one the learner actually
  // works in, so it shows up in the quick menu.
  function notePairUsed() {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        recentPairs: rememberPair(
          prev.recentPairs,
          prev.inputLanguage,
          prev.goalLanguage,
          Date.now()
        ),
      };
      saveSettings(next);
      return next;
    });
  }

  function setPro(value: boolean) {
    if (!settings) return;
    handleSaveSettings({ ...settings, isPro: value });
  }

  function setUiLanguage(code: string) {
    if (!settings) return;
    handleSaveSettings({ ...settings, uiLanguage: code });
  }

  function setDefaultMode(mode: 'free' | 'ask') {
    if (!settings) return;
    handleSaveSettings({ ...settings, defaultMode: mode });
  }

  function setTheme(mode: 'light' | 'dark' | 'system') {
    if (!settings) return;
    handleSaveSettings({ ...settings, theme: mode });
  }

  function purchasePro() {
    // Stub — real in-app purchase wiring comes later.
    const t = makeT(resolveUiLang(settings?.uiLanguage ?? 'auto'));
    setPro(true);
    Alert.alert(t('alert.proTitle'), t('alert.purchaseSimulated'));
  }

  function restorePurchases() {
    // Stub — real restore flow comes later.
    const t = makeT(resolveUiLang(settings?.uiLanguage ?? 'auto'));
    Alert.alert(
      t('alert.restoreTitle'),
      settings?.isPro ? t('alert.alreadyPro') : t('alert.noPurchases')
    );
  }

  // New vocab starts untagged; tags are added later via the row tag editor, so
  // the add payload deliberately omits them.
  function addVocab(items: Omit<VocabItem, 'id' | 'createdAt' | 'tags' | 'reviews' | 'known'>[]) {
    setVocab((prev) => {
      const existing = new Set(prev.map((v) => `${v.lang}:${v.term.toLowerCase()}`));
      const fresh = items
        .filter((i) => i.term.trim() && !existing.has(`${i.lang}:${i.term.toLowerCase()}`))
        .map((i) => ({
          ...i,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tags: [],
          createdAt: Date.now(),
          reviews: 0,
          known: 0,
        }));
      if (fresh.length > 0) notePairUsed();
      const next = [...fresh, ...prev];
      saveVocab(next);
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

  // Returns the phrase id (existing one if it's a duplicate), so the dialog can
  // attach tags to the just-saved phrase.
  function addPhrase(p: Omit<PhraseItem, 'id' | 'createdAt' | 'reviews' | 'known'>): string {
    const dup = phrases.find(
      (x) => x.lang === p.lang && x.target.trim() === p.target.trim()
    );
    if (dup) return dup.id;
    const item: PhraseItem = {
      ...p,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      reviews: 0,
      known: 0,
    };
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

  // Resolve the active palette from the persisted setting + OS scheme. Computed
  // here (not via useTheme) because App owns the ThemeProvider; the same value
  // feeds the provider, the local styles, and the StatusBar.
  const mode = resolveThemeMode(settings?.theme ?? 'system', scheme);
  const appTheme = themeFor(mode);
  const styles = useMemo(() => makeStyles(appTheme), [appTheme]);
  const barStyle = mode === 'dark' ? 'light-content' : 'dark-content';

  if (!ready || !settings) {
    return (
      <ThemeProvider theme={appTheme}>
        <View style={[styles.root, styles.center]}>
          <StatusBar barStyle={barStyle} />
          <Text style={[styles.logo, styles.logoWord]}>Parla</Text>
          <ActivityIndicator color={appTheme.colors.accent} style={{ marginTop: 16 }} />
        </View>
      </ThemeProvider>
    );
  }

  const uiLang = resolveUiLang(settings.uiLanguage);
  const t = makeT(uiLang);

  return (
    <ThemeProvider theme={appTheme}>
    <I18nProvider lang={uiLang}>
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={barStyle} backgroundColor={appTheme.colors.bg} />
      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>文</Text>
          <View style={styles.logoDot} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.logo}>
            Parl<Text style={styles.logoWord}>a</Text>
          </Text>
          <Text style={styles.tagline}>{t('app.tagline').toUpperCase()}</Text>
        </View>
        <PairMenu
          input={settings.inputLanguage}
          goal={settings.goalLanguage}
          pairs={settings.recentPairs}
          onPick={usePair}
        />
      </View>

      <View style={styles.body}>
        {tab === 'dialog' && (
          <DialogScreen
            settings={settings}
            onAddVocab={addVocab}
            onAddPhrase={addPhrase}
            onUpdatePhrase={updatePhrase}
            onChangeInputLanguage={changeInputLanguage}
            onChangeGoalLanguage={changeGoalLanguage}
            onSwapLanguages={swapLanguages}
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
            tagSuggestions={recentTags(phrases)}
            settings={settings}
          />
        )}
        {tab === 'settings' && (
          <SettingsScreen
            settings={settings}
            onChangeInputLanguage={changeInputLanguage}
            onChangeGoalLanguage={changeGoalLanguage}
            setUiLanguage={setUiLanguage}
            setDefaultMode={setDefaultMode}
            setTheme={setTheme}
            setPro={setPro}
            purchasePro={purchasePro}
            restorePurchases={restorePurchases}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tb) => {
          const active = tb.key === tab;
          return (
            <Pressable key={tb.key} style={styles.tab} onPress={() => setTab(tb.key)}>
              <Ionicons
                name={tb.icon}
                size={22}
                color={active ? appTheme.colors.accent : appTheme.colors.textFaint}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t('tab.' + tb.key)}
                {tb.key === 'vocab' && vocab.length > 0 ? `  ${vocab.length}` : ''}
                {tb.key === 'phrases' && phrases.length > 0 ? `  ${phrases.length}` : ''}
              </Text>
              {active && <View style={styles.tabDot} />}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
    </I18nProvider>
    </ThemeProvider>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingTop: Platform.OS === 'android' ? 16 : 4,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    logoMark: {
      width: 46,
      height: 46,
      borderRadius: 15,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 8,
    },
    logoMarkText: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: -1 },
    // Cyan accent pip echoing the orange→cyan brand gradient on the app icon.
    logoDot: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.colors.accent2,
      borderWidth: 2.5,
      borderColor: theme.colors.bg,
    },
    headerText: { flex: 1 },
    logo: { fontSize: 31, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.5 },
    logoWord: { color: theme.colors.accent },
    tagline: {
      color: theme.colors.accent2,
      fontSize: 10,
      fontWeight: '800',
      marginTop: 2,
      letterSpacing: 2,
    },
    body: { flex: 1 },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.bgElevated,
      borderTopWidth: 1,
      borderTopColor: theme.colors.cardBorder,
      paddingBottom: Platform.OS === 'ios' ? 22 : 10,
      paddingTop: 10,
    },
    tab: { flex: 1, alignItems: 'center', gap: 2 },
    tabIcon: { fontSize: 20, opacity: 0.5 },
    tabIconActive: { opacity: 1 },
    tabLabel: { color: theme.colors.textFaint, fontSize: 11, fontWeight: '600' },
    tabLabelActive: { color: theme.colors.text },
    tabDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.accent,
      marginTop: 2,
    },
  });
}
