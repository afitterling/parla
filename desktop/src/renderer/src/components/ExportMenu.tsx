import { useEffect, useRef, useState } from 'react';
import { Share } from 'lucide-react';
import { ExportFormat } from '../export';
import { useT } from '../i18n/I18nContext';

// Small popover offering CSV / JSON export — the desktop stand-in for the
// mobile action sheet.
export function ExportMenu({ onPick }: { onPick: (format: ExportFormat) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  function pick(format: ExportFormat) {
    setOpen(false);
    onPick(format);
  }

  return (
    <div className="export-wrap" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('export.title')}
        title={t('export.title')}
      >
        <Share size={18} />
      </button>
      {open && (
        <div className="export-menu">
          <div className="export-menu-title">{t('export.choose')}</div>
          <button onClick={() => pick('csv')}>{t('export.csv')}</button>
          <button onClick={() => pick('json')}>{t('export.json')}</button>
        </div>
      )}
    </div>
  );
}
