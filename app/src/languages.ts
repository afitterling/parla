// Supported languages, used for BOTH the spoken input and the learning goal.
// `whisper` is the ISO-639-1 hint for OpenAI Whisper. `romanize` triggers a
// pronunciation aid (Pinyin / Romaji) when this language is the learning goal.
export type Language = {
  code: string;
  whisper: string;
  label: string;
  flag: string;
  nativeName: string;
  romanize?: boolean; // Asian scripts → show Pinyin/Romaji reading aid
  promptHint?: string; // extra instruction appended to the dialogue system prompt
  speech?: string; // BCP-47 locale for text-to-speech (defaults to `code`)
};

// BCP-47 locale used by expo-speech for read-aloud. Falls back to the code.
export function speechLocale(lang: Language): string {
  return lang.speech ?? lang.code;
}

// The full set of languages OpenAI Whisper can transcribe (~99). `whisper` is
// the ISO-639-1 hint sent to the API; `romanize: true` is set for every
// non-Latin script so the dialogue offers a Latin transliteration aid. `speech`
// is a best-effort BCP-47 TTS locale (omitted where no good iOS voice exists —
// transcription + translation still work; read-aloud may just be silent).
export const LANGUAGES: Language[] = [
  // ── Common / originally supported ──────────────────────────────────────────
  { code: 'de', whisper: 'de', label: 'Deutsch', flag: '🇩🇪', nativeName: 'Deutsch', speech: 'de-DE' },
  { code: 'en', whisper: 'en', label: 'Englisch', flag: '🇬🇧', nativeName: 'English', speech: 'en-US' },
  { code: 'zh', whisper: 'zh', label: 'Chinesisch', flag: '🇨🇳', nativeName: '中文', romanize: true, speech: 'zh-CN' },
  {
    code: 'zh-TW',
    whisper: 'zh',
    label: 'Chinesisch (Taiwan)',
    flag: '🇹🇼',
    nativeName: '繁體中文',
    romanize: true,
    speech: 'zh-TW',
    promptHint: 'Verwende ausschließlich traditionelle chinesische Schriftzeichen (繁體).',
  },
  { code: 'yue', whisper: 'zh', label: 'Kantonesisch', flag: '🇭🇰', nativeName: '粵語', romanize: true, speech: 'zh-HK', promptHint: 'Antworte auf Kantonesisch (Yue).' },
  { code: 'ja', whisper: 'ja', label: 'Japanisch', flag: '🇯🇵', nativeName: '日本語', romanize: true, speech: 'ja-JP' },
  { code: 'ko', whisper: 'ko', label: 'Koreanisch', flag: '🇰🇷', nativeName: '한국어', romanize: true, speech: 'ko-KR' },
  { code: 'es', whisper: 'es', label: 'Spanisch', flag: '🇪🇸', nativeName: 'Español', speech: 'es-ES' },
  { code: 'fr', whisper: 'fr', label: 'Französisch', flag: '🇫🇷', nativeName: 'Français', speech: 'fr-FR' },
  { code: 'it', whisper: 'it', label: 'Italienisch', flag: '🇮🇹', nativeName: 'Italiano', speech: 'it-IT' },
  { code: 'pt', whisper: 'pt', label: 'Portugiesisch', flag: '🇵🇹', nativeName: 'Português', speech: 'pt-BR' },
  { code: 'ru', whisper: 'ru', label: 'Russisch', flag: '🇷🇺', nativeName: 'Русский', romanize: true, speech: 'ru-RU' },
  { code: 'ar', whisper: 'ar', label: 'Arabisch', flag: '🇸🇦', nativeName: 'العربية', romanize: true, speech: 'ar-SA' },
  { code: 'hi', whisper: 'hi', label: 'Hindi', flag: '🇮🇳', nativeName: 'हिन्दी', romanize: true, speech: 'hi-IN' },
  // ── Europe ─────────────────────────────────────────────────────────────────
  { code: 'nl', whisper: 'nl', label: 'Niederländisch', flag: '🇳🇱', nativeName: 'Nederlands', speech: 'nl-NL' },
  { code: 'pl', whisper: 'pl', label: 'Polnisch', flag: '🇵🇱', nativeName: 'Polski', speech: 'pl-PL' },
  { code: 'uk', whisper: 'uk', label: 'Ukrainisch', flag: '🇺🇦', nativeName: 'Українська', romanize: true, speech: 'uk-UA' },
  { code: 'sv', whisper: 'sv', label: 'Schwedisch', flag: '🇸🇪', nativeName: 'Svenska', speech: 'sv-SE' },
  { code: 'da', whisper: 'da', label: 'Dänisch', flag: '🇩🇰', nativeName: 'Dansk', speech: 'da-DK' },
  { code: 'no', whisper: 'no', label: 'Norwegisch', flag: '🇳🇴', nativeName: 'Norsk', speech: 'nb-NO' },
  { code: 'nn', whisper: 'nn', label: 'Nynorsk', flag: '🇳🇴', nativeName: 'Nynorsk', speech: 'nb-NO' },
  { code: 'fi', whisper: 'fi', label: 'Finnisch', flag: '🇫🇮', nativeName: 'Suomi', speech: 'fi-FI' },
  { code: 'cs', whisper: 'cs', label: 'Tschechisch', flag: '🇨🇿', nativeName: 'Čeština', speech: 'cs-CZ' },
  { code: 'sk', whisper: 'sk', label: 'Slowakisch', flag: '🇸🇰', nativeName: 'Slovenčina', speech: 'sk-SK' },
  { code: 'el', whisper: 'el', label: 'Griechisch', flag: '🇬🇷', nativeName: 'Ελληνικά', romanize: true, speech: 'el-GR' },
  { code: 'ro', whisper: 'ro', label: 'Rumänisch', flag: '🇷🇴', nativeName: 'Română', speech: 'ro-RO' },
  { code: 'hu', whisper: 'hu', label: 'Ungarisch', flag: '🇭🇺', nativeName: 'Magyar', speech: 'hu-HU' },
  { code: 'hr', whisper: 'hr', label: 'Kroatisch', flag: '🇭🇷', nativeName: 'Hrvatski', speech: 'hr-HR' },
  { code: 'bs', whisper: 'bs', label: 'Bosnisch', flag: '🇧🇦', nativeName: 'Bosanski', speech: 'bs-BA' },
  { code: 'sr', whisper: 'sr', label: 'Serbisch', flag: '🇷🇸', nativeName: 'Српски', romanize: true, speech: 'sr-RS' },
  { code: 'sl', whisper: 'sl', label: 'Slowenisch', flag: '🇸🇮', nativeName: 'Slovenščina', speech: 'sl-SI' },
  { code: 'bg', whisper: 'bg', label: 'Bulgarisch', flag: '🇧🇬', nativeName: 'Български', romanize: true, speech: 'bg-BG' },
  { code: 'mk', whisper: 'mk', label: 'Mazedonisch', flag: '🇲🇰', nativeName: 'Македонски', romanize: true, speech: 'mk-MK' },
  { code: 'lt', whisper: 'lt', label: 'Litauisch', flag: '🇱🇹', nativeName: 'Lietuvių', speech: 'lt-LT' },
  { code: 'lv', whisper: 'lv', label: 'Lettisch', flag: '🇱🇻', nativeName: 'Latviešu', speech: 'lv-LV' },
  { code: 'et', whisper: 'et', label: 'Estnisch', flag: '🇪🇪', nativeName: 'Eesti', speech: 'et-EE' },
  { code: 'be', whisper: 'be', label: 'Belarussisch', flag: '🇧🇾', nativeName: 'Беларуская', romanize: true, speech: 'be-BY' },
  { code: 'ca', whisper: 'ca', label: 'Katalanisch', flag: '🇪🇸', nativeName: 'Català', speech: 'ca-ES' },
  { code: 'gl', whisper: 'gl', label: 'Galicisch', flag: '🇪🇸', nativeName: 'Galego', speech: 'gl-ES' },
  { code: 'eu', whisper: 'eu', label: 'Baskisch', flag: '🇪🇸', nativeName: 'Euskara', speech: 'eu-ES' },
  { code: 'cy', whisper: 'cy', label: 'Walisisch', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', nativeName: 'Cymraeg', speech: 'cy-GB' },
  { code: 'br', whisper: 'br', label: 'Bretonisch', flag: '🇫🇷', nativeName: 'Brezhoneg' },
  { code: 'oc', whisper: 'oc', label: 'Okzitanisch', flag: '🇫🇷', nativeName: 'Occitan' },
  { code: 'is', whisper: 'is', label: 'Isländisch', flag: '🇮🇸', nativeName: 'Íslenska', speech: 'is-IS' },
  { code: 'fo', whisper: 'fo', label: 'Färöisch', flag: '🇫🇴', nativeName: 'Føroyskt' },
  { code: 'lb', whisper: 'lb', label: 'Luxemburgisch', flag: '🇱🇺', nativeName: 'Lëtzebuergesch' },
  { code: 'mt', whisper: 'mt', label: 'Maltesisch', flag: '🇲🇹', nativeName: 'Malti' },
  { code: 'sq', whisper: 'sq', label: 'Albanisch', flag: '🇦🇱', nativeName: 'Shqip', speech: 'sq-AL' },
  { code: 'la', whisper: 'la', label: 'Latein', flag: '🏛️', nativeName: 'Latina' },
  // ── Middle East & Central / South Asia ─────────────────────────────────────
  { code: 'he', whisper: 'he', label: 'Hebräisch', flag: '🇮🇱', nativeName: 'עברית', romanize: true, speech: 'he-IL' },
  { code: 'fa', whisper: 'fa', label: 'Persisch', flag: '🇮🇷', nativeName: 'فارسی', romanize: true, speech: 'fa-IR' },
  { code: 'ur', whisper: 'ur', label: 'Urdu', flag: '🇵🇰', nativeName: 'اردو', romanize: true, speech: 'ur-PK' },
  { code: 'ps', whisper: 'ps', label: 'Paschtu', flag: '🇦🇫', nativeName: 'پښتو', romanize: true },
  { code: 'sd', whisper: 'sd', label: 'Sindhi', flag: '🇵🇰', nativeName: 'سنڌي', romanize: true },
  { code: 'yi', whisper: 'yi', label: 'Jiddisch', flag: '✡️', nativeName: 'ייִדיש', romanize: true },
  { code: 'hy', whisper: 'hy', label: 'Armenisch', flag: '🇦🇲', nativeName: 'Հայերեն', romanize: true, speech: 'hy-AM' },
  { code: 'ka', whisper: 'ka', label: 'Georgisch', flag: '🇬🇪', nativeName: 'ქართული', romanize: true, speech: 'ka-GE' },
  { code: 'az', whisper: 'az', label: 'Aserbaidschanisch', flag: '🇦🇿', nativeName: 'Azərbaycanca', speech: 'az-AZ' },
  { code: 'kk', whisper: 'kk', label: 'Kasachisch', flag: '🇰🇿', nativeName: 'Қазақ', romanize: true, speech: 'kk-KZ' },
  { code: 'uz', whisper: 'uz', label: 'Usbekisch', flag: '🇺🇿', nativeName: 'Oʻzbekcha', speech: 'uz-UZ' },
  { code: 'tg', whisper: 'tg', label: 'Tadschikisch', flag: '🇹🇯', nativeName: 'Тоҷикӣ', romanize: true },
  { code: 'tk', whisper: 'tk', label: 'Turkmenisch', flag: '🇹🇲', nativeName: 'Türkmençe' },
  { code: 'tt', whisper: 'tt', label: 'Tatarisch', flag: '🇷🇺', nativeName: 'Татарча', romanize: true },
  { code: 'ba', whisper: 'ba', label: 'Baschkirisch', flag: '🇷🇺', nativeName: 'Башҡортса', romanize: true },
  { code: 'mn', whisper: 'mn', label: 'Mongolisch', flag: '🇲🇳', nativeName: 'Монгол', romanize: true, speech: 'mn-MN' },
  { code: 'tr', whisper: 'tr', label: 'Türkisch', flag: '🇹🇷', nativeName: 'Türkçe', speech: 'tr-TR' },
  { code: 'sa', whisper: 'sa', label: 'Sanskrit', flag: '🕉️', nativeName: 'संस्कृतम्', romanize: true },
  { code: 'bn', whisper: 'bn', label: 'Bengalisch', flag: '🇧🇩', nativeName: 'বাংলা', romanize: true, speech: 'bn-IN' },
  { code: 'as', whisper: 'as', label: 'Assamesisch', flag: '🇮🇳', nativeName: 'অসমীয়া', romanize: true },
  { code: 'mr', whisper: 'mr', label: 'Marathi', flag: '🇮🇳', nativeName: 'मराठी', romanize: true, speech: 'mr-IN' },
  { code: 'ne', whisper: 'ne', label: 'Nepali', flag: '🇳🇵', nativeName: 'नेपाली', romanize: true, speech: 'ne-NP' },
  { code: 'pa', whisper: 'pa', label: 'Punjabi', flag: '🇮🇳', nativeName: 'ਪੰਜਾਬੀ', romanize: true, speech: 'pa-IN' },
  { code: 'gu', whisper: 'gu', label: 'Gujarati', flag: '🇮🇳', nativeName: 'ગુજરાતી', romanize: true, speech: 'gu-IN' },
  { code: 'ta', whisper: 'ta', label: 'Tamil', flag: '🇮🇳', nativeName: 'தமிழ்', romanize: true, speech: 'ta-IN' },
  { code: 'te', whisper: 'te', label: 'Telugu', flag: '🇮🇳', nativeName: 'తెలుగు', romanize: true, speech: 'te-IN' },
  { code: 'kn', whisper: 'kn', label: 'Kannada', flag: '🇮🇳', nativeName: 'ಕನ್ನಡ', romanize: true, speech: 'kn-IN' },
  { code: 'ml', whisper: 'ml', label: 'Malayalam', flag: '🇮🇳', nativeName: 'മലയാളം', romanize: true, speech: 'ml-IN' },
  { code: 'si', whisper: 'si', label: 'Singhalesisch', flag: '🇱🇰', nativeName: 'සිංහල', romanize: true, speech: 'si-LK' },
  // ── Southeast Asia ─────────────────────────────────────────────────────────
  { code: 'th', whisper: 'th', label: 'Thailändisch', flag: '🇹🇭', nativeName: 'ไทย', romanize: true, speech: 'th-TH' },
  { code: 'vi', whisper: 'vi', label: 'Vietnamesisch', flag: '🇻🇳', nativeName: 'Tiếng Việt', speech: 'vi-VN' },
  { code: 'id', whisper: 'id', label: 'Indonesisch', flag: '🇮🇩', nativeName: 'Bahasa Indonesia', speech: 'id-ID' },
  { code: 'ms', whisper: 'ms', label: 'Malaiisch', flag: '🇲🇾', nativeName: 'Bahasa Melayu', speech: 'ms-MY' },
  { code: 'tl', whisper: 'tl', label: 'Tagalog', flag: '🇵🇭', nativeName: 'Tagalog', speech: 'fil-PH' },
  { code: 'jw', whisper: 'jw', label: 'Javanisch', flag: '🇮🇩', nativeName: 'Basa Jawa' },
  { code: 'su', whisper: 'su', label: 'Sundanesisch', flag: '🇮🇩', nativeName: 'Basa Sunda' },
  { code: 'km', whisper: 'km', label: 'Khmer', flag: '🇰🇭', nativeName: 'ខ្មែរ', romanize: true, speech: 'km-KH' },
  { code: 'lo', whisper: 'lo', label: 'Laotisch', flag: '🇱🇦', nativeName: 'ລາວ', romanize: true, speech: 'lo-LA' },
  { code: 'my', whisper: 'my', label: 'Birmanisch', flag: '🇲🇲', nativeName: 'မြန်မာ', romanize: true, speech: 'my-MM' },
  { code: 'bo', whisper: 'bo', label: 'Tibetisch', flag: '🏔️', nativeName: 'བོད་སྐད་', romanize: true },
  // ── Africa ─────────────────────────────────────────────────────────────────
  { code: 'sw', whisper: 'sw', label: 'Suaheli', flag: '🇰🇪', nativeName: 'Kiswahili', speech: 'sw-KE' },
  { code: 'af', whisper: 'af', label: 'Afrikaans', flag: '🇿🇦', nativeName: 'Afrikaans', speech: 'af-ZA' },
  { code: 'am', whisper: 'am', label: 'Amharisch', flag: '🇪🇹', nativeName: 'አማርኛ', romanize: true },
  { code: 'so', whisper: 'so', label: 'Somali', flag: '🇸🇴', nativeName: 'Soomaali' },
  { code: 'ha', whisper: 'ha', label: 'Hausa', flag: '🇳🇬', nativeName: 'Hausa' },
  { code: 'yo', whisper: 'yo', label: 'Yoruba', flag: '🇳🇬', nativeName: 'Yorùbá' },
  { code: 'sn', whisper: 'sn', label: 'Shona', flag: '🇿🇼', nativeName: 'ChiShona' },
  { code: 'ln', whisper: 'ln', label: 'Lingala', flag: '🇨🇩', nativeName: 'Lingála' },
  { code: 'mg', whisper: 'mg', label: 'Madagassisch', flag: '🇲🇬', nativeName: 'Malagasy' },
  // ── Pacific & Other ────────────────────────────────────────────────────────
  { code: 'mi', whisper: 'mi', label: 'Maori', flag: '🇳🇿', nativeName: 'Māori' },
  { code: 'haw', whisper: 'haw', label: 'Hawaiianisch', flag: '🌺', nativeName: 'ʻŌlelo Hawaiʻi' },
  { code: 'ht', whisper: 'ht', label: 'Haitianisch', flag: '🇭🇹', nativeName: 'Kreyòl Ayisyen' },
];

export const DEFAULT_LANGUAGE = LANGUAGES.find((l) => l.code === 'zh') ?? LANGUAGES[0];

export function findLanguage(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE;
}
