import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { LANGUAGES, Language } from '../languages';
import { useT } from '../i18n/I18nContext';

// Searchable, scrollable language picker shared by Settings and the Dialog bar.
// The learnable-language list is ~100 entries, so search matters. Emits a
// language `code` to `onSelect`.
type Props = {
  visible: boolean;
  title: string;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  // Languages the learner already has content in. When given (and not
  // searching), they appear in an "Existing content" section on top and the
  // remaining languages follow under "All languages".
  priorityCodes?: string[];
};

// Rows of the list: section headers mixed into the language rows.
type Row = { kind: 'header'; title: string } | { kind: 'lang'; lang: Language };

// Lowercase + strip diacritics so "espanol" matches "Español".
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function LanguagePicker({
  visible,
  title,
  selectedCode,
  onSelect,
  onClose,
  priorityCodes,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState('');

  const results = useMemo<Row[]>(() => {
    const q = fold(query.trim());
    if (q) {
      // Searching flattens the sections — match across the whole list.
      return LANGUAGES.filter(
        (l) =>
          fold(l.nativeName).includes(q) ||
          fold(l.label).includes(q) ||
          l.code.toLowerCase().includes(q)
      ).map((lang) => ({ kind: 'lang' as const, lang }));
    }
    const priority = (priorityCodes ?? [])
      .map((code) => LANGUAGES.find((l) => l.code === code))
      .filter((l): l is Language => !!l);
    if (priority.length === 0) return LANGUAGES.map((lang) => ({ kind: 'lang' as const, lang }));
    const inPriority = new Set(priority.map((l) => l.code));
    return [
      { kind: 'header' as const, title: t('langPicker.existing') },
      ...priority.map((lang) => ({ kind: 'lang' as const, lang })),
      { kind: 'header' as const, title: t('langPicker.all') },
      ...LANGUAGES.filter((l) => !inPriority.has(l.code)).map((lang) => ({
        kind: 'lang' as const,
        lang,
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, priorityCodes]);

  function close() {
    setQuery('');
    onClose();
  }

  // Close on Escape while open.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-plain" onClick={close} aria-label={t('common.done')}>
            <X size={22} />
          </button>
        </div>

        <div className="sheet-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder={t('langPicker.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
          />
        </div>

        <div className="sheet-list">
          {results.length === 0 && <p className="no-match">{t('langPicker.noMatch')}</p>}
          {results.map((row) => {
            if (row.kind === 'header') {
              return (
                <div key={`h:${row.title}`} className="section-head">
                  {row.title}
                </div>
              );
            }
            const item = row.lang;
            const active = item.code === selectedCode;
            return (
              <button
                key={item.code}
                className={`lang-row${active ? ' active' : ''}`}
                onClick={() => {
                  onSelect(item.code);
                  close();
                }}
              >
                <span className="flag">{item.flag}</span>
                <span className="lang-row-text">
                  <span className="native">{item.nativeName}</span>
                  <span className="label">{item.label}</span>
                </span>
                {active && <Check size={18} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
