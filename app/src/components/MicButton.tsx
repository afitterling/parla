import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { useStyles, useTheme } from '../ThemeContext';

// Round mic button used by the add cards of Vocab and Phrases: idle → mic,
// recording → stop, transcribing → spinner.
export function MicButton({
  recording,
  busy,
  onPress,
  label,
}: {
  recording: boolean;
  busy: boolean;
  onPress: () => void;
  label: string;
}) {
  const styles = useStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable
      style={[styles.micBtn, recording && styles.micBtnActive]}
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.accent} />
      ) : (
        <Ionicons
          name={recording ? 'stop' : 'mic-outline'}
          size={18}
          color={recording ? '#fff' : theme.colors.accent}
        />
      )}
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    micBtn: {
      width: 42,
      height: 42,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentDim,
    },
    micBtnActive: { backgroundColor: theme.colors.danger },
  });
}
