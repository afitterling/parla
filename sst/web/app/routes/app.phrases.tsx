import { Scaffold } from '~/components/Scaffold';

// Phrases screen — list, flashcard trainer, and the type-quiz sub-tab.
//
// Port from: desktop/src/renderer/src/screens/PhraseScreen.tsx
export default function PhrasesRoute() {
  return (
    <Scaffold
      title="Phrasen"
      portedFrom="desktop/src/renderer/src/screens/PhraseScreen.tsx"
      todo={[
        'List / Training / Quiz segmented control',
        'List: search, latest-vs-by-tag ordering, tag filter chips, tag modal',
        'Training: flashcards with direction toggle, reveal, "Nochmal" / "Gewusst" scoring',
        'TypeQuiz over phrases — persists reviews/known via onResult',
      ]}
    />
  );
}
