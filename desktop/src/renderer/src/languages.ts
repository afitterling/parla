// Supported languages, used for BOTH the spoken input and the learning goal.
// `whisper` is the ISO-639-1 hint for OpenAI Whisper. `romanize` triggers a
// pronunciation aid (Pinyin / Romaji) when this language is the learning goal.
export type Language = {
  code: string;
  whisper: string;
  label: string;
  flag: string;
  nativeName: string;
  romanize?: boolean;
  promptHint?: string;
};

export const LANGUAGES: Language[] = [
  { code: 'de', whisper: 'de', label: 'Deutsch', flag: '🇩🇪', nativeName: 'Deutsch' },
  { code: 'en', whisper: 'en', label: 'Englisch', flag: '🇬🇧', nativeName: 'English' },
  { code: 'zh', whisper: 'zh', label: 'Chinesisch', flag: '🇨🇳', nativeName: '中文', romanize: true },
  {
    code: 'zh-TW',
    whisper: 'zh',
    label: 'Chinesisch (Taiwan)',
    flag: '🇹🇼',
    nativeName: '繁體中文',
    romanize: true,
    promptHint: 'Verwende ausschließlich traditionelle chinesische Schriftzeichen (繁體).',
  },
  { code: 'ja', whisper: 'ja', label: 'Japanisch', flag: '🇯🇵', nativeName: '日本語', romanize: true },
  { code: 'es', whisper: 'es', label: 'Spanisch', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'fr', whisper: 'fr', label: 'Französisch', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'it', whisper: 'it', label: 'Italienisch', flag: '🇮🇹', nativeName: 'Italiano' },
];

export const DEFAULT_LANGUAGE = LANGUAGES.find((l) => l.code === 'zh') ?? LANGUAGES[0];

export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE;
}
