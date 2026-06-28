import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

type Props = {
  text: string;
  /** BCP-47 locale, e.g. 'zh-CN'. Defaults to the device voice. */
  locale?: string;
  size?: number;
  style?: ViewStyle;
};

// Round play/stop button that reads `text` aloud via the device TTS engine.
export function SpeakButton({ text, locale, size = 18, style }: Props) {
  const [speaking, setSpeaking] = useState(false);

  // Stop any in-flight speech when the row unmounts.
  useEffect(() => () => { Speech.stop(); }, []);

  function toggle() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!text.trim()) return;
    setSpeaking(true);
    Speech.speak(text, {
      language: locale,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  return (
    <Pressable
      hitSlop={10}
      onPress={toggle}
      style={[styles.btn, speaking && styles.btnActive, style]}
    >
      <Ionicons
        name={speaking ? 'stop' : 'volume-high'}
        size={size}
        color={speaking ? '#001b1f' : theme.colors.accent2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent2Dim,
  },
  btnActive: { backgroundColor: theme.colors.accent2 },
});
