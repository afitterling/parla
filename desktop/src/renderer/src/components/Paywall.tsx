import { useT } from '../i18n/I18nContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

export function Paywall({ visible, onClose, onUpgrade }: Props) {
  const t = useT();
  if (!visible) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('paywall.title')}</h3>
        <p className="modal-text">{t('paywall.text')}</p>
        <button className="primary-btn" onClick={onUpgrade}>
          {t('paywall.upgrade')}
        </button>
        <button className="text-btn" onClick={onClose}>
          {t('paywall.later')}
        </button>
      </div>
    </div>
  );
}
