import { useEffect, useState } from 'react';
import {
  Globe,
  Mic,
  GraduationCap,
  ChevronRight,
  ChevronDown,
  ArrowLeftRight,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react';
import { Settings } from '../storage';
import { findLanguage } from '../languages';
import { LanguagePicker } from '../components/LanguagePicker';
import { useT } from '../i18n/I18nContext';
import { UI_LANGS } from '../i18n';

type Props = {
  settings: Settings;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  setUiLanguage: (code: string) => void;
  setDefaultMode: (mode: 'free' | 'ask') => void;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;
  setPro: (value: boolean) => void;
  purchasePro: () => void;
  restorePurchases: () => void;
};

export function SettingsScreen({
  settings,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  setUiLanguage,
  setDefaultMode,
  setTheme,
  setPro,
  purchasePro,
  restorePurchases,
}: Props) {
  const t = useT();
  const [picker, setPicker] = useState<'input' | 'goal' | null>(null);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<{ version: string; dataDir: string; platform: string; electron: string } | null>(
    null
  );

  useEffect(() => {
    window.parla?.info().then(setInfo).catch(() => setInfo(null));
  }, []);

  const debugRows: { label: string; value: string }[] = [
    { label: 'Version', value: info?.version ?? '—' },
    { label: 'Platform', value: info?.platform ?? navigator.platform },
    { label: 'Electron', value: info?.electron ?? '—' },
  ];

  async function copyDebug() {
    const text = [...debugRows.map((r) => `${r.label}: ${r.value}`), `Data: ${info?.dataDir ?? ''}`].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const themeOpts = [
    { mode: 'system' as const, Icon: Monitor, label: t('theme.system') },
    { mode: 'light' as const, Icon: Sun, label: t('theme.light') },
    { mode: 'dark' as const, Icon: Moon, label: t('theme.dark') },
  ];

  const modeOpts = [
    { mode: 'free' as const, Icon: ArrowLeftRight, label: t('dialog.modeFree') },
    { mode: 'ask' as const, Icon: GraduationCap, label: t('dialog.modeAsk') },
  ];

  return (
    <div className="screen">
      <div className="content">
        <div className="label">{t('settings.appLanguage').toUpperCase()}</div>
        <div className="select-row">
          <Globe size={20} className="ink" />
          <select
            className="select"
            value={settings.uiLanguage}
            onChange={(e) => setUiLanguage(e.target.value)}
          >
            <option value="auto">{t('settings.auto')}</option>
            {UI_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="select-caret" />
        </div>

        <div className="label">{t('settings.startMode').toUpperCase()}</div>
        <div className="mode-grid">
          {modeOpts.map(({ mode, Icon, label }) => (
            <button
              key={mode}
              className={`mode-tile${settings.defaultMode === mode ? ' active' : ''}`}
              onClick={() => setDefaultMode(mode)}
            >
              <Icon size={22} />
              <span className="lt-name">{label}</span>
            </button>
          ))}
        </div>

        <div className="label">{t('settings.theme').toUpperCase()}</div>
        <div className="mode-grid">
          {themeOpts.map(({ mode, Icon, label }) => (
            <button
              key={mode}
              className={`mode-tile${settings.theme === mode ? ' active' : ''}`}
              onClick={() => setTheme(mode)}
            >
              <Icon size={22} />
              <span className="lt-name">{label}</span>
            </button>
          ))}
        </div>

        <div className="label">{t('settings.iSpeakInput')}</div>
        <button className="selector" onClick={() => setPicker('input')}>
          <Mic size={20} className="ink" />
          <span className="selector-value">{findLanguage(settings.inputLanguage).nativeName}</span>
          <ChevronRight size={18} />
        </button>

        <div className="label">{t('settings.iLearnGoal')}</div>
        <button className="selector" onClick={() => setPicker('goal')}>
          <GraduationCap size={20} className="ink" />
          <span className="selector-value">{findLanguage(settings.goalLanguage).nativeName}</span>
          <ChevronRight size={18} />
        </button>

        <div className="label">{t('settings.parlaPro')}</div>
        <div className="scard">
          <div className={`status${settings.isPro ? ' active' : ''}`}>
            {settings.isPro ? t('settings.proActive') : t('settings.proFree')}
          </div>
          <label className="switch-row">
            <span>{t('settings.proTest')}</span>
            <input
              type="checkbox"
              className="switch"
              checked={settings.isPro}
              onChange={(e) => setPro(e.target.checked)}
            />
          </label>
          <button className="primary-btn" onClick={purchasePro}>
            {t('settings.buyPro')}
          </button>
          <button className="text-btn" onClick={restorePurchases}>
            {t('settings.restorePurchases')}
          </button>
          <p className="hint">{t('settings.proHint')}</p>
        </div>

        <div className="label">{t('settings.about').toUpperCase()}</div>
        <div className="scard clickable" onClick={copyDebug}>
          {debugRows.map((r) => (
            <div key={r.label} className="debug-row">
              <span className="debug-key">{r.label}</span>
              <span className="debug-val">{r.value}</span>
            </div>
          ))}
          <p className="hint">{copied ? t('settings.copied') : t('settings.copyDebug')}</p>
        </div>

        {info?.dataDir && (
          <>
            <div className="label">{t('settings.dataDir').toUpperCase()}</div>
            <div className="scard">
              <div className="data-path">{info.dataDir}</div>
              <p className="hint">{t('settings.dataHint')}</p>
            </div>
          </>
        )}
      </div>

      <LanguagePicker
        visible={picker !== null}
        title={picker === 'input' ? t('settings.iSpeakInput') : t('settings.iLearnGoal')}
        selectedCode={picker === 'input' ? settings.inputLanguage : settings.goalLanguage}
        onSelect={(code) =>
          picker === 'input' ? onChangeInputLanguage(code) : onChangeGoalLanguage(code)
        }
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
