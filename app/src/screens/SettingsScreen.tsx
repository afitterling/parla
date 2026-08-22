import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { iCloudStatus, Settings } from '../storage';
import { exportBackup, importBackup } from '../backup';
import { findLanguage } from '../languages';
import { LanguagePicker } from '../components/LanguagePicker';
import { useT } from '../i18n/I18nContext';
import { UI_LANGS } from '../i18n';

type Props = {
  settings: Settings;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  onAddLearnLanguage: (code: string) => void;
  onRemoveLearnLanguage: (code: string) => void;
  setUiLanguage: (code: string) => void;
  setDefaultMode: (mode: 'free' | 'ask') => void;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;
  setPro: (value: boolean) => void;
  setEmergencyEnabled: (value: boolean) => void;
  purchasePro: () => void;
  restorePurchases: () => void;
  /** Re-read the stores after an import replaced what is on disk. */
  onImported: () => void;
};

export function SettingsScreen({
  settings,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  onAddLearnLanguage,
  onRemoveLearnLanguage,
  setUiLanguage,
  setDefaultMode,
  setTheme,
  setPro,
  setEmergencyEnabled,
  purchasePro,
  restorePurchases,
  onImported,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [picker, setPicker] = useState<'input' | 'learn' | null>(null);
  const [uiLangOpen, setUiLangOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  // Which iCloud container this build talks to. When a build looks like it lost
  // its library, this is the first thing to check — the bundle id can change
  // without the container changing, and vice versa.
  const [sync, setSync] = useState<{
    linked: boolean;
    available: boolean;
    container: string;
  } | null>(null);

  useEffect(() => {
    iCloudStatus()
      .then(setSync)
      .catch(() => setSync(null));
  }, []);

  // App / build info — baked in from app.json at build time (see scripts/setVersion.sh).
  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '—';
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? '—';
  const systemInfo = `${Platform.OS} ${Platform.Version}`;
  const debugRows: { label: string; value: string }[] = [
    { label: 'Version', value: String(appVersion) },
    { label: 'Build', value: String(buildNumber) },
    { label: 'Bundle', value: String(bundleId) },
    { label: 'iCloud', value: sync ? sync.container || '—' : '…' },
    {
      label: 'Sync',
      value: sync ? (sync.available ? 'on' : sync.linked ? 'off' : 'not linked') : '…',
    },
    { label: 'System', value: systemInfo },
  ];

  async function runExport() {
    setBackupBusy('export');
    try {
      await exportBackup(t('backup.shareTitle'));
    } catch (e: any) {
      Alert.alert(t('settings.backup'), e?.message ?? String(e));
    } finally {
      setBackupBusy(null);
    }
  }

  async function runImport() {
    setBackupBusy('import');
    try {
      const added = await importBackup(t('backup.invalid'));
      if (added) {
        onImported();
        Alert.alert(t('settings.backup'), t('backup.imported', added));
      }
    } catch (e: any) {
      Alert.alert(t('settings.backup'), e?.message ?? String(e));
    } finally {
      setBackupBusy(null);
    }
  }

  async function copyDebug() {
    await Clipboard.setStringAsync(debugRows.map((r) => `${r.label}: ${r.value}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>{t('settings.appLanguage').toUpperCase()}</Text>
        <Pressable style={styles.selector} onPress={() => setUiLangOpen(true)}>
          <Ionicons name="language-outline" size={20} color={theme.colors.accent} />
          <Text style={styles.selectorValue}>
            {settings.uiLanguage === 'auto'
              ? t('settings.auto')
              : UI_LANGS.find((l) => l.code === settings.uiLanguage)?.label ?? settings.uiLanguage}
          </Text>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textFaint} />
        </Pressable>

        <Text style={styles.sectionLabel}>{t('settings.startMode').toUpperCase()}</Text>
        <View style={styles.modeGrid}>
          {([
            { mode: 'free' as const, icon: 'swap-horizontal-outline' as const, label: t('dialog.modeFree') },
            { mode: 'ask' as const, icon: 'school-outline' as const, label: t('dialog.modeAsk') },
          ]).map((m) => {
            const isActive = settings.defaultMode === m.mode;
            return (
              <Pressable
                key={m.mode}
                style={[styles.modeTile, isActive && styles.langTileActive]}
                onPress={() => setDefaultMode(m.mode)}
              >
                <Ionicons
                  name={m.icon}
                  size={22}
                  color={isActive ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[styles.langName, isActive && styles.langNameActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>{t('settings.theme').toUpperCase()}</Text>
        <View style={styles.modeGrid}>
          {([
            { mode: 'system' as const, icon: 'phone-portrait-outline' as const, label: t('theme.system') },
            { mode: 'light' as const, icon: 'sunny-outline' as const, label: t('theme.light') },
            { mode: 'dark' as const, icon: 'moon-outline' as const, label: t('theme.dark') },
          ]).map((m) => {
            const isActive = settings.theme === m.mode;
            return (
              <Pressable
                key={m.mode}
                style={[styles.modeTile, isActive && styles.langTileActive]}
                onPress={() => setTheme(m.mode)}
              >
                <Ionicons
                  name={m.icon}
                  size={22}
                  color={isActive ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[styles.langName, isActive && styles.langNameActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>{t('settings.iSpeakInput')}</Text>
        <Pressable style={styles.selector} onPress={() => setPicker('input')}>
          <Ionicons name="mic-outline" size={20} color={theme.colors.accent} />
          <Text style={styles.selectorValue}>{findLanguage(settings.inputLanguage).nativeName}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
        </Pressable>

        {/* Multiple goal languages, saved in settings (what consumes the set
            beyond the dialog is still open — Coach groundwork). One chip per
            language: tap = make it the active goal, ✕ = remove, + = add. */}
        <Text style={styles.sectionLabel}>{t('settings.iLearnGoal')}</Text>
        <View style={styles.learnRow}>
          {settings.learnLanguages.map((code) => {
            const l = findLanguage(code);
            const active = code === settings.goalLanguage;
            return (
              <Pressable
                key={code}
                style={[styles.learnChip, active && styles.learnChipActive]}
                onPress={() => onChangeGoalLanguage(code)}
              >
                <Text style={styles.learnChipFlag}>{l.flag}</Text>
                <Text style={[styles.learnChipText, active && styles.learnChipTextActive]}>
                  {l.nativeName}
                </Text>
                {/* The active goal cannot be removed — switch to another first. */}
                {!active && (
                  <Pressable onPress={() => onRemoveLearnLanguage(code)} hitSlop={8}>
                    <Ionicons name="close" size={13} color={theme.colors.textFaint} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
          <Pressable style={styles.learnAddChip} onPress={() => setPicker('learn')}>
            <Ionicons name="add" size={15} color={theme.colors.accent} />
            <Text style={styles.learnAddText}>{t('settings.addLanguage')}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{t('settings.learnLanguagesHint')}</Text>

        {/* Emergency mode — off by default; the red header button only shows
            when this is on. */}
        <Text style={styles.sectionLabel}>{t('emergency.title').toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={[styles.switchRow, { marginTop: 0 }]}>
            <Text style={styles.switchLabel}>{t('emergency.settingsLabel')}</Text>
            <Switch
              value={settings.emergencyEnabled}
              onValueChange={setEmergencyEnabled}
              trackColor={{ false: theme.colors.cardBorder, true: theme.colors.danger }}
              thumbColor="#fff"
            />
          </View>
          <Text style={[styles.hint, { marginTop: 0 }]}>{t('emergency.settingsHint')}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t('settings.parlaPro')}</Text>
        <View style={styles.card}>
          <Text style={[styles.status, settings.isPro ? styles.statusActive : styles.statusFree]}>
            {settings.isPro ? t('settings.proActive') : t('settings.proFree')}
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('settings.proTest')}</Text>
            <Switch
              value={settings.isPro}
              onValueChange={setPro}
              trackColor={{ false: theme.colors.cardBorder, true: theme.colors.accent }}
              thumbColor="#fff"
            />
          </View>

          <Pressable style={styles.primaryBtn} onPress={purchasePro}>
            <Text style={styles.primaryBtnText}>{t('settings.buyPro')}</Text>
          </Pressable>

          <Pressable style={styles.textBtn} onPress={restorePurchases}>
            <Text style={styles.textBtnText}>{t('settings.restorePurchases')}</Text>
          </Pressable>

          <Text style={styles.hint}>{t('settings.proHint')}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t('settings.backup').toUpperCase()}</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.primaryBtn}
            onPress={runExport}
            disabled={backupBusy !== null}
          >
            {backupBusy === 'export' ? (
              <ActivityIndicator size="small" color="#001b1f" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('settings.exportBackup')}</Text>
            )}
          </Pressable>
          <Pressable style={styles.textBtn} onPress={runImport} disabled={backupBusy !== null}>
            {backupBusy === 'import' ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Text style={styles.textBtnText}>{t('settings.importBackup')}</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>{t('settings.backupHint')}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t('settings.about').toUpperCase()}</Text>
        <Pressable style={styles.card} onLongPress={copyDebug} delayLongPress={350}>
          {debugRows.map((r) => (
            <View key={r.label} style={styles.debugRow}>
              <Text style={styles.debugKey}>{r.label}</Text>
              <Text style={styles.debugVal} selectable>
                {r.value}
              </Text>
            </View>
          ))}
          <Text style={styles.hint}>
            {copied ? t('settings.copied') : t('settings.copyDebug')}
          </Text>
        </Pressable>
      </ScrollView>

      <LanguagePicker
        visible={picker !== null}
        title={picker === 'input' ? t('settings.iSpeakInput') : t('settings.addLanguage')}
        selectedCode={picker === 'input' ? settings.inputLanguage : settings.goalLanguage}
        onSelect={(code) =>
          picker === 'input' ? onChangeInputLanguage(code) : onAddLearnLanguage(code)
        }
        onClose={() => setPicker(null)}
      />

      {/* App-language dropdown: Automatic + the translated UI languages. */}
      <Modal
        visible={uiLangOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUiLangOpen(false)}
      >
        <Pressable style={styles.dropBackdrop} onPress={() => setUiLangOpen(false)}>
          <Pressable style={styles.dropSheet} onPress={() => {}}>
            {[{ code: 'auto', label: t('settings.auto') }, ...UI_LANGS].map((l) => {
              const active = l.code === settings.uiLanguage;
              return (
                <Pressable
                  key={l.code}
                  style={[styles.dropRow, active && styles.dropRowActive]}
                  onPress={() => {
                    setUiLangOpen(false);
                    setUiLanguage(l.code);
                  }}
                >
                  <Ionicons
                    name={l.code === 'auto' ? 'globe-outline' : 'language-outline'}
                    size={17}
                    color={active ? theme.colors.accent : theme.colors.textMuted}
                  />
                  <Text style={[styles.dropText, active && styles.dropTextActive]}>{l.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color={theme.colors.accent} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  sectionLabel: {
    color: theme.colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 10,
  },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  learnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  learnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  learnChipActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentDim },
  learnChipFlag: { fontSize: 14 },
  learnChipText: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  learnChipTextActive: { color: theme.colors.accent },
  learnAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accent,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  learnAddText: { color: theme.colors.accent, fontSize: 13, fontWeight: '700' },
  dropBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dropSheet: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 8,
  },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropRowActive: { backgroundColor: theme.colors.accentDim },
  dropText: { color: theme.colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  dropTextActive: { color: theme.colors.accent },
  modeGrid: { flexDirection: 'row', gap: 10 },
  modeTile: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingVertical: 14,
    alignItems: 'center',
  },
  langTile: {
    width: '31%',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingVertical: 14,
    alignItems: 'center',
  },
  langTileActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentDim },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  selectorValue: { flex: 1, color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  langFlag: { fontSize: 26 },
  langName: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  langNameActive: { color: theme.colors.text },
  langNative: { color: theme.colors.textFaint, fontSize: 11, marginTop: 1 },

  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  hint: { color: theme.colors.textFaint, fontSize: 12, marginTop: 10 },

  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  debugKey: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
  debugVal: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },

  status: { fontSize: 16, fontWeight: '800' },
  statusActive: { color: theme.colors.success },
  statusFree: { color: theme.colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },
  switchLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  textBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 2 },
  textBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '700' },
  });
}
