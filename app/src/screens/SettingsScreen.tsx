import { useState } from 'react';
import {
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
import { Settings } from '../storage';
import { LANGUAGES } from '../languages';

type Props = {
  settings: Settings;
  onSave: (s: Settings) => void;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
};

export function SettingsScreen({
  settings,
  onSave,
  onChangeInputLanguage,
  onChangeGoalLanguage,
}: Props) {
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicKey);
  const [openaiKey, setOpenaiKey] = useState(settings.openaiKey);
  const [savedFlash, setSavedFlash] = useState(false);

  function save() {
    onSave({
      ...settings,
      anthropicKey: anthropicKey.trim(),
      openaiKey: openaiKey.trim(),
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>ICH SPRECHE (INPUT)</Text>
        <LangGrid
          active={settings.inputLanguage}
          icon="mic-outline"
          onPick={onChangeInputLanguage}
        />

        <Text style={styles.sectionLabel}>ICH LERNE (ZIEL)</Text>
        <LangGrid
          active={settings.goalLanguage}
          icon="school-outline"
          onPick={onChangeGoalLanguage}
        />

        <Text style={styles.sectionLabel}>API-KEYS</Text>
        <View style={styles.card}>
          <Text style={styles.keyLabel}>OpenAI — Transkription + Dialog</Text>
          <TextInput
            style={styles.input}
            placeholder="sk-…"
            placeholderTextColor={theme.colors.textFaint}
            value={openaiKey}
            onChangeText={setOpenaiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            platform.openai.com → API Keys · betreibt Whisper (Sprache) + den Dialog (gpt-4o-mini)
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.keyLabel}>Claude (Anthropic) — optional, aktuell nicht genutzt</Text>
          <TextInput
            style={styles.input}
            placeholder="sk-ant-…"
            placeholderTextColor={theme.colors.textFaint}
            value={anthropicKey}
            onChangeText={setAnthropicKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>console.anthropic.com → API Keys</Text>
        </View>

        <Pressable style={styles.saveBtn} onPress={save}>
          {savedFlash && <Ionicons name="checkmark" size={16} color="#fff" />}
          <Text style={styles.saveBtnText}>{savedFlash ? 'Gespeichert' : 'Speichern'}</Text>
        </Pressable>

        <Text style={styles.note}>
          Keys werden nur lokal auf dem Gerät gespeichert. Standardwerte kommen aus der .env-Datei
          (EXPO_PUBLIC_…). Hier eingetragene Keys haben Vorrang.
        </Text>
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
            <Text style={[styles.langName, isActive && styles.langNameActive]}>{l.label}</Text>
            <Text style={styles.langNative}>{l.nativeName}</Text>
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
  keyLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: theme.colors.text,
    fontSize: 14,
  },
  hint: { color: theme.colors.textFaint, fontSize: 12, marginTop: 6 },

  saveBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { color: theme.colors.textFaint, fontSize: 12, lineHeight: 18, marginTop: 16 },
});
