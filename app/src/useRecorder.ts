import { useState } from 'react';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';

export type RecorderState = 'idle' | 'recording';

// Thin wrapper around expo-audio's recorder. Returns the recorded file URI
// on stop, which the caller hands to Whisper for transcription.
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function start(): Promise<void> {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Mikrofon-Zugriff verweigert.');
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
  }

  async function stop(): Promise<string | null> {
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    setState('idle');
    return uri ?? null;
  }

  return { state, start, stop };
}
