import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { LANGUAGES } from '../languages';
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
};

// Lowercase + strip diacritics so "espanol" matches "Español".
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function LanguagePicker({ visible, title, selectedCode, onSelect, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        fold(l.nativeName).includes(q) ||
        fold(l.label).includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [query]);

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
          {results.map((item) => {
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
