import { Scaffold } from '~/components/Scaffold';

// Vocabulary screen — the word list plus the type-quiz sub-tab.
//
// Port from: desktop/src/renderer/src/screens/VocabScreen.tsx
//        and desktop/src/renderer/src/components/TypeQuiz.tsx
export default function VocabRoute() {
  return (
    <Scaffold
      title="Vokabular"
      portedFrom="desktop/src/renderer/src/screens/VocabScreen.tsx"
      todo={[
        'List/Quiz segmented control',
        'Word rows: term / pinyin / translation / example, tags, copy + speak buttons',
        'Add-word card (term + translation)',
        'TypeQuiz: tag filter, accent-folded answer matching, check/reveal, score, done screen',
        'Export menu (CSV/JSON) — port app/src/export.ts',
        'Speech: the desktop SpeakButton uses the Web Speech API, so it ports as-is',
      ]}
    />
  );
}
