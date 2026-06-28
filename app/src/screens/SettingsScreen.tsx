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
import { theme } from '../theme';
import { Settings } from '../storage';
import { LANGUAGES } from '../languages';
import { useT } from '../i18n/I18nContext';
import { UI_LANGS } from '../i18n';

type Props = {
  settings: Settings;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  setUiLanguage: (code: string) => void;
  setPro: (value: boolean) => void;
  purchasePro: () => void;
  restorePurchases: () => void;
};

export function SettingsScreen({
  settings,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  setUiLanguage,
  setPro,
  purchasePro,
  restorePurchases,
}: Props) {
  const t = useT();
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

        <Text style={styles.sectionLabel}>{t('settings.iSpeakInput')}</Text>
        <LangGrid
          active={settings.inputLanguage}
          icon="mic-outline"
          onPick={onChangeInputLanguage}
        />

        <Text style={styles.sectionLabel}>{t('settings.iLearnGoal')}</Text>
        <LangGrid
          active={settings.goalLanguage}
          icon="school-outline"
          onPick={onChangeGoalLanguage}
        />

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LangGrid({
  active,
  icon,
  onPick,
}: {
  active: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPick: (code: string) => void;
}) {
  return (
    <View style={styles.langGrid}>
      {LANGUAGES.map((l) => {
        const isActive = l.code === active;
        return (
          <Pressable
            key={l.code}
            style={[styles.langTile, isActive && styles.langTileActive]}
            onPress={() => onPick(l.code)}
          >
            <Ionicons
              name={icon}
              size={22}
              color={isActive ? theme.colors.accent : theme.colors.textMuted}
            />
            <Text style={[styles.langName, isActive && styles.langNameActive]}>
              {l.nativeName}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
