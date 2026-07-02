import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';

type Props = {
  text: string;
  /** BCP-47 locale, e.g. 'zh-CN'. Defaults to the system voice. */
  locale?: string;
  size?: number;
  className?: string;
};

// Pick the best-matching installed voice for a BCP-47 locale (exact first, then
// same base language), so e.g. Chinese text is read by a Chinese voice.
function pickVoice(locale?: string): SpeechSynthesisVoice | undefined {
  if (!locale) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const want = locale.toLowerCase();
  const base = want.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base))
  );
}

// Round play/stop button that reads `text` aloud via the browser TTS engine.
export function SpeakButton({ text, locale, size = 18, className }: Props) {
  const [speaking, setSpeaking] = useState(false);

  // Stop any in-flight speech when the row unmounts.
  useEffect(() => () => window.speechSynthesis.cancel(), []);

  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (locale) u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`speak-btn${speaking ? ' active' : ''}${className ? ' ' + className : ''}`}
      aria-label="Read aloud"
    >
      {speaking ? <Square size={size} /> : <Volume2 size={size} />}
    </button>
  );
}
