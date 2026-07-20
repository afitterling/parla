import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';
import { LanguagePair } from '../storage';
import { findLanguage } from '../languages';

// Quick switch between the language pairs the learner has already saved content
// into. Sits in the app header: the button shows the pair in use, tapping it
// drops down the recently used ones — one tap sets input + goal together.
type Props = {
  input: string;
  goal: string;
  pairs: LanguagePair[];
  onPick: (input: string, goal: string) => void;
};

export function PairMenu({ input, goal, pairs, onPick }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);

  // The pair in use always leads the list, even before anything was saved in it.
  const list: LanguagePair[] = [
    { input, goal, usedAt: 0 },
    ...pairs.filter((p) => !(p.input === input && p.goal === goal)),
  ];

  return (
    <>
      <Pressable style={styles.btn} onPress={() => setOpen(true)} hitSlop={6}>
        <Text style={styles.btnFlags}>
          {findLanguage(input).flag}
          {findLanguage(goal).flag}
        </Text>
        <Ionicons name="chevron-down" size={13} color={theme.colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{t('pairs.title')}</Text>
            <ScrollView style={styles.list}>
              {list.map((p) => {
                const active = p.input === input && p.goal === goal;
                const from = findLanguage(p.input);
                const to = findLanguage(p.goal);
                return (
                  <Pressable
                    key={`${p.input}>${p.goal}`}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      setOpen(false);
                      if (!active) onPick(p.input, p.goal);
                    }}
                  >
                    <Text style={styles.rowFlags}>
                      {from.flag} → {to.flag}
                    </Text>
                    <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                      {from.nativeName} → {to.nativeName}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            {list.length === 1 && <Text style={styles.hint}>{t('pairs.empty')}</Text>}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      backgroundColor: theme.colors.bgElevated,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    btnFlags: { fontSize: 15, letterSpacing: 1 },

    backdrop: { flex: 1, backgroundColor: '#00000066', paddingTop: 96, paddingHorizontal: 16 },
    sheet: {
      alignSelf: 'flex-end',
      width: '86%',
      maxWidth: 340,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      padding: 12,
    },
    title: {
      color: theme.colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginBottom: 8,
      marginLeft: 4,
    },
    list: { maxHeight: 320 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 11,
    },
    rowActive: { backgroundColor: theme.colors.accentDim },
    rowFlags: { fontSize: 15 },
    rowText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600', flex: 1 },
    rowTextActive: { color: theme.colors.text },
    hint: {
      color: theme.colors.textFaint,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 10,
      paddingTop: 6,
    },
  });
}
