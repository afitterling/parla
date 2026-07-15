import { Scaffold } from '~/components/Scaffold';

// Dialog screen — Interpreter / Coach modes, mic + text input, AI bubbles with
// vocab chips, "word for word" breakdown, and save-as-phrase.
//
// Port from: desktop/src/renderer/src/screens/DialogScreen.tsx (552 lines).
// The server calls it needs already exist: POST /api/chat, POST /api/breakdown.
export default function DialogRoute() {
  return (
    <Scaffold
      title="Dialog"
      portedFrom="desktop/src/renderer/src/screens/DialogScreen.tsx"
      todo={[
        'Mode segment (Interpreter / Coach) + language bar with swap and the Aa pinyin toggle',
        'Message list: AiBubble (target / pinyin / translation / vocab chips) + UserBubble',
        'Wire POST /api/chat for a dialogue turn (replaces the client-side chatWithAI)',
        'Wire POST /api/breakdown for "Wort für Wort" + "Alle hinzufügen"',
        'Mic recording — BLOCKED on /api/transcribe (README open question 3)',
        'Free-tier quota chip — must read a server-side count, not storage.ts (README q2)',
      ]}
    />
  );
}
