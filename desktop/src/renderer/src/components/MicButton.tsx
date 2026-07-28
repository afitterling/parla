import { Mic, Square } from 'lucide-react';

// Round mic button used by the add cards of Vocab and Phrases: idle → mic,
// recording → stop, transcribing → spinner.
export function MicButton({
  recording,
  busy,
  onClick,
  label,
}: {
  recording: boolean;
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`mic-btn${recording ? ' active' : ''}`}
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
    >
      {busy ? <span className="spinner" /> : recording ? <Square size={16} /> : <Mic size={16} />}
    </button>
  );
}
