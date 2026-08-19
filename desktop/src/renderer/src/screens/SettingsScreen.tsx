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
  Plus,
  X,
  Check,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { Settings, iCloudStatus } from '../storage';
import { exportBackup, importBackup } from '../backup';
import { findLanguage } from '../languages';
import { LanguagePicker } from '../components/LanguagePicker';
import { useT } from '../i18n/I18nContext';
import { UI_LANGS } from '../i18n';

type Props = {
  settings: Settings;
  onChangeInputLanguage: (code: string) => void;
  onChangeGoalLanguage: (code: string) => void;
  onAddLearnLanguage: (code: string) => void;
  onRemoveLearnLanguage: (code: string) => void;
  setUiLanguage: (code: string) => void;
  setDefaultMode: (mode: 'free' | 'ask') => void;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;
  setEmergencyEnabled: (value: boolean) => void;
  setPro: (value: boolean) => void;
  purchasePro: () => void;
  restorePurchases: () => void;
  /** Re-read the stores after an import replaced what is on disk. */
  onImported: () => void;
};

export function SettingsScreen({
  settings,
  onChangeInputLanguage,
  onChangeGoalLanguage,
  onAddLearnLanguage,
  onRemoveLearnLanguage,
  setUiLanguage,
  setDefaultMode,
  setTheme,
  setEmergencyEnabled,
  setPro,
  purchasePro,
  restorePurchases,
  onImported,
}: Props) {
  const t = useT();
  const [picker, setPicker] = useState<'input' | 'learn' | null>(null);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<{
    version: string;
    dataDir: string;
    icloud: boolean;
    platform: string;
    electron: string;
  } | null>(null);
  const [sync, setSync] = useState<{ linked: boolean; available: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);
  const [backupNote, setBackupNote] = useState<string | null>(null);

  useEffect(() => {
    window.parla?.info().then(setInfo).catch(() => setInfo(null));
    iCloudStatus().then(setSync).catch(() => setSync(null));
  }, []);

  const debugRows: { label: string; value: string }[] = [
    { label: 'Version', value: info?.version ?? '—' },
    { label: 'Platform', value: info?.platform ?? navigator.platform },
    { label: 'Electron', value: info?.electron ?? '—' },
  ];

  async function runExport() {
    setBackupBusy('export');
    setBackupNote(null);
    try {
      await exportBackup();
    } catch (e: any) {
      setBackupNote(e?.message ?? String(e));
    } finally {
      setBackupBusy(null);
    }
  }

  async function runImport() {
    setBackupBusy('import');
    setBackupNote(null);
    try {
      const added = await importBackup(t('backup.invalid'));
      if (added) {
        onImported();
        setBackupNote(t('backup.imported', added));
      }
    } catch (e: any) {
      setBackupNote(e?.message ?? String(e));
    } finally {
      setBackupBusy(null);
    }
  }

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
        <div className="learn-langs">
          {settings.learnLanguages.map((code) => {
            const active = code === settings.goalLanguage;
            return (
              <span key={code} className={`learn-chip${active ? ' active' : ''}`}>
                <button className="learn-chip-main" onClick={() => onChangeGoalLanguage(code)}>
                  {active && <Check size={13} />}
                  {findLanguage(code).nativeName}
                </button>
                {!active && (
                  <button
                    className="learn-chip-x"
                    onClick={() => onRemoveLearnLanguage(code)}
                    aria-label={t('common.cancel')}
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            );
          })}
          <button className="learn-chip add" onClick={() => setPicker('learn')}>
            <Plus size={14} />
            {t('common.new')}
          </button>
        </div>

        <div className="label">{t('settings.emergency').toUpperCase()}</div>
        <div className="scard">
          <label className="switch-row">
            <span>{t('settings.emergencyEnable')}</span>
            <input
              type="checkbox"
              className="switch"
              checked={settings.emergencyEnabled}
              onChange={(e) => setEmergencyEnabled(e.target.checked)}
            />
          </label>
          <p className="hint">{t('settings.emergencyHint')}</p>
        </div>

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

        <div className="label">{t('settings.backup').toUpperCase()}</div>
        <div className="scard">
          <button className="primary-btn" onClick={runExport} disabled={backupBusy !== null}>
            {t('settings.exportBackup')}
          </button>
          <button className="text-btn" onClick={runImport} disabled={backupBusy !== null}>
            {t('settings.importBackup')}
          </button>
          <p className="hint">{backupNote ?? t('settings.backupHint')}</p>
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
              <div className={`sync-status${sync?.available ? ' on' : ''}`}>
                {sync?.available ? <Cloud size={16} /> : <CloudOff size={16} />}
                {sync?.available ? t('settings.syncOn') : t('settings.syncLocal')}
              </div>
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
        onSelect={(code) => {
          if (picker === 'input') onChangeInputLanguage(code);
          else {
            // Add to the learn set and make it the active goal.
            onAddLearnLanguage(code);
            onChangeGoalLanguage(code);
          }
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
