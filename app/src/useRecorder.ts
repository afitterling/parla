import { useState } from 'react';
import {
  useAudioRecorder,
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  type RecordingOptions,
} from 'expo-audio';

export type RecorderState = 'idle' | 'recording';

// Recording profile tuned for speech-to-text rather than for music. Three
// things matter in a noisy café/street:
//   • mono — the HIGH_QUALITY preset records stereo, which on a phone means a
//     wide ambience image; a single channel keeps the voice mic and drops the
//     room around it.
//   • 16 kHz — the rate Whisper resamples to anyway, so the anti-alias filter
//     runs on the device and throws away hiss/clatter above 8 kHz instead of
//     encoding it and shipping it to the API.
//   • Android `voice_recognition` — asks the platform for the mic path with
//     noise suppression and AGC tuned for ASR (what the dictation keyboard
//     uses). iOS has no equivalent knob through expo-audio.
// 48 kbit/s AAC is transparent at mono/16 kHz and keeps uploads small, which
// also makes the 60 s API timeout far harder to hit on a weak connection.
const SPEECH_QUALITY: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'voice_recognition',
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 48000,
  },
};

// Thin wrapper around expo-audio's recorder. Returns the recorded file URI
// on stop, which the caller hands to Whisper for transcription.
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const recorder = useAudioRecorder(SPEECH_QUALITY);

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
