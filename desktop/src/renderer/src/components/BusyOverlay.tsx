import { useT } from '../i18n/I18nContext';

type Props = {
  visible: boolean;
  label?: string | null;
  onCancel?: () => void;
};

// Full-surface dimmed overlay with a spinner + label, shown during long API
// calls (transcription, translation). An optional cancel button aborts the
// in-flight request.
export function BusyOverlay({ visible, label, onCancel }: Props) {
  const t = useT();
  if (!visible) return null;
  return (
    <div className="busy-overlay">
      <div className="busy-card">
        <span className="spinner big" />
        {!!label && <span className="busy-label">{label}</span>}
        {onCancel && (
          <button className="busy-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
