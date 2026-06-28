import { useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording';

// MediaRecorder wrapper. Returns the recorded audio Blob on stop, which is
// handed to Whisper for transcription.
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const mr = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.start();
    mediaRef.current = mr;
    setState('recording');
  }

  function stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const mr = mediaRef.current;
      if (!mr) {
        resolve(null);
        return;
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRef.current = null;
        setState('idle');
        resolve(blob);
      };
      mr.stop();
    });
  }

  return { state, start, stop };
}
