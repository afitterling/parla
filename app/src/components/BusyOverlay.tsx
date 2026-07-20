import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';
import { useT } from '../i18n/I18nContext';

// Full-screen pending indicator for anything that waits on the network
// (transcription, the dialogue reply, the word-by-word breakdown). It dims and
// blocks the screen so the wait is unmissable, shows how long it has been
// running, and offers Cancel. Disappears the moment the work finishes.
type Props = {
  visible: boolean;
  label: string | null;
  onCancel: () => void;
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function BusyOverlay({ visible, label, onCancel }: Props) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  const t = useT();
  const [elapsed, setElapsed] = useState(0);

  // Tick from a start timestamp rather than counting intervals, so a stalled or
  // backgrounded JS thread doesn't undercount the wait.
  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Swallows taps — the screen is intentionally blocked while pending. */}
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          {!!label && <Text style={styles.label}>{label}</Text>}
          <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#000000AA',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: theme.colors.card,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      paddingVertical: 26,
      paddingHorizontal: 22,
      alignItems: 'center',
      gap: 10,
    },
    label: { color: theme.colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    timer: {
      color: theme.colors.textMuted,
      fontSize: 22,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    cancelBtn: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 22,
      paddingVertical: 10,
    },
    cancelText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '700' },
  });
}
