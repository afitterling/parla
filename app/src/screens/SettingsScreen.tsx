import { useState } from 'react';
import {
  KeyboardAvoidingView,
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
import { Settings } from '../storage';
import { findLanguage } from '../languages';
import { LanguagePicker } from '../components/LanguagePicker';
import { useT } from '../i18n/I18nContext';
import { UI_LANGS } from '../i18n';

type Props = {
  settings: Settings;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  setUiLanguage: (code: string) => void;
  setDefaultMode: (mode: 'free' | 'ask') => void;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;
  setPro: (value: boolean) => void;
  purchasePro: () => void;
  restorePurchases: () => void;
};

export function SettingsScreen({
  settings,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  setUiLanguage,
  setDefaultMode,
  setTheme,
  setPro,
  purchasePro,
  restorePurchases,
}: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [picker, setPicker] = useState<'input' | 'goal' | null>(null);
  const [copied, setCopied] = useState(false);

  // App / build info — baked in from app.json at build time (see scripts/setVersion.sh).
  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '—';
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier ?? '—';
  const systemInfo = `${Platform.OS} ${Platform.Version}`;
  const debugRows: { label: string; value: string }[] = [
    { label: 'Version', value: String(appVersion) },
    { label: 'Build', value: String(buildNumber) },
    { label: 'Bundle', value: String(bundleId) },
    { label: 'System', value: systemInfo },
  ];

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
        <View style={styles.langGrid}>
          <Pressable
            style={[styles.langTile, settings.uiLanguage === 'auto' && styles.langTileActive]}
            onPress={() => setUiLanguage('auto')}
          >
            <Ionicons
              name="globe-outline"
              size={22}
              color={settings.uiLanguage === 'auto' ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text
              style={[
                styles.langName,
                settings.uiLanguage === 'auto' && styles.langNameActive,
              ]}
            >
              {t('settings.auto')}
            </Text>
          </Pressable>
          {UI_LANGS.map((l) => {
            const isActive = l.code === settings.uiLanguage;
            return (
              <Pressable
                key={l.code}
                style={[styles.langTile, isActive && styles.langTileActive]}
                onPress={() => setUiLanguage(l.code)}
              >
                <Ionicons
                  name="language-outline"
                  size={22}
                  color={isActive ? theme.colors.accent : theme.colors.textMuted}
                />
                <Text style={[styles.langName, isActive && styles.langNameActive]}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>

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

        <Text style={styles.sectionLabel}>{t('settings.iLearnGoal')}</Text>
        <Pressable style={styles.selector} onPress={() => setPicker('goal')}>
          <Ionicons name="school-outline" size={20} color={theme.colors.accent} />
          <Text style={styles.selectorValue}>{findLanguage(settings.goalLanguage).nativeName}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
        </Pressable>

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
        title={picker === 'input' ? t('settings.iSpeakInput') : t('settings.iLearnGoal')}
        selectedCode={picker === 'input' ? settings.inputLanguage : settings.goalLanguage}
        onSelect={(code) =>
          picker === 'input' ? onChangeInputLanguage(code) : onChangeGoalLanguage(code)
        }
        onClose={() => setPicker(null)}
      />
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
