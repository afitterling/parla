// The record shapes Parla stores. Kept identical to the iOS (`app/src/storage.ts`)
// and desktop (`desktop/src/renderer/src/storage.ts`) definitions — the same
// records sync between clients, so these three must not drift.

export type VocabItem = {
  id: string;
  term: string;
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string;
  example?: string;
  examplePinyin?: string; // reading aid for the example sentence
  exampleTranslation?: string; // example sentence translated into the input language
  lang: string;
  tags: string[];
  createdAt: number;
};

export type PhraseItem = {
  id: string;
  target: string; // the phrase in the target language
  pinyin?: string; // Pinyin/Romaji reading aid (Asian goal languages)
  translation: string; // translation into the input language
  lang: string;
  tags: string[];
  createdAt: number;
  reviews: number; // how often trained
  known: number; // how often marked "known"
};

export type Settings = {
  inputLanguage: string; // what the learner speaks (Whisper transcription)
  goalLanguage: string; // the language being learned (Parla speaks/teaches)
  showPinyin: boolean; // show Pinyin/Romaji line for Asian goal languages
  isPro: boolean; // Parla Pro — removes the free-tier rate limit
  uiLanguage: string; // app UI language: a UiLang code or 'auto' (device locale)
  defaultMode: 'free' | 'ask'; // 'free' = Interpreter, 'ask' = Coach
  theme: 'light' | 'dark' | 'system';
};

// NOTE: unlike the other two clients, Settings here has no `openaiKey`. On the
// web the key lives only in the SST secret, server-side — see api.chat.ts.

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type VocabSuggestion = {
  term: string;
  pinyin?: string;
  translation: string;
  example?: string;
  examplePinyin?: string;
  exampleTranslation?: string;
};

export type DialogReply = {
  target: string; // assistant line in the goal language
  pinyin?: string; // pronunciation aid (Pinyin/Romaji)
  translation: string; // translation into the input language
  vocab: VocabSuggestion[]; // 0–3 useful words from the line
};

export const DEFAULT_SETTINGS: Settings = {
  inputLanguage: 'de',
  goalLanguage: 'zh',
  showPinyin: true,
  isPro: false,
  uiLanguage: 'auto',
  defaultMode: 'free',
  theme: 'system',
};

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
