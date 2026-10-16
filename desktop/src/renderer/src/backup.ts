// Full backup: every store the app owns in one JSON file — the desktop half of
// app/src/backup.ts, reading and writing the same shape so a file exported on
// the phone imports here and the other way round.
//
// The phone needs this because its local mirror lives in a sandbox keyed by the
// bundle id, so a build with a different id starts empty. Desktop reads the
// shared iCloud folder directly and has no such problem, but a file you can
// keep is worth having on both sides.
import {
  loadPhrases,
  loadQuizPrefs,
  loadSettings,
  loadVocab,
  mergeById,
  PhraseItem,
  QuizPrefs,
  QuizScope,
  savePhrases,
  saveQuizPrefs,
  saveSettings,
  saveVocab,
  Settings,
  VocabItem,
} from './storage';

const FORMAT = 'parla.backup';
const FORMAT_VERSION = 1;
const QUIZ_SCOPES: QuizScope[] = ['vocab', 'phrases', 'train'];

// Preferences travel; the API keys and the Pro flag deliberately do not — a
// backup file gets mailed around, and Pro belongs to the store account.
type BackupSettings = Omit<Settings, 'anthropicKey' | 'openaiKey' | 'isPro'>;

export type Backup = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  source: { app: string; version: string; bundleId: string };
  vocab: VocabItem[];
  phrases: PhraseItem[];
  // Pinned dialog cards exist on iOS only. They ride along untouched in files
  // this app never wrote, and are ignored on import here.
  pinned?: unknown[];
  settings: BackupSettings;
  quiz: Partial<Record<QuizScope, QuizPrefs>>;
};

export type ImportResult = { vocab: number; phrases: number; pinned: number };

function stripSecrets(s: Settings): BackupSettings {
  const { anthropicKey: _a, openaiKey: _o, isPro: _p, ...rest } = s;
  return rest;
}

export async function buildBackup(): Promise<Backup> {
  const [vocab, phrases, settings, info] = await Promise.all([
    loadVocab(),
    loadPhrases(),
    loadSettings(),
    window.parla?.info().catch(() => null) ?? null,
  ]);
  const quizEntries = await Promise.all(
    QUIZ_SCOPES.map(async (scope) => [scope, await loadQuizPrefs(scope)] as const)
  );
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      app: 'Parla Desktop',
      version: info?.version ?? '',
      bundleId: 'tech.sp33c.parla.desktop',
    },
    vocab,
    phrases,
    settings: stripSecrets(settings),
    quiz: Object.fromEntries(quizEntries),
  };
}

export async function exportBackup(): Promise<void> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parla-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isBackup(value: any): value is Backup {
  return !!value && value.format === FORMAT && Array.isArray(value.vocab);
}

// Merge a parsed backup into the current stores. Merging (not replacing) is the
// safe direction: mergeById never drops an item that exists on either side, so
// importing into a library that already has content cannot lose anything.
export async function applyBackup(backup: Backup): Promise<ImportResult> {
  const [vocab, phrases, settings] = await Promise.all([
    loadVocab(),
    loadPhrases(),
    loadSettings(),
  ]);

  const mergedVocab = mergeById(vocab, backup.vocab ?? []);
  const mergedPhrases = mergeById(phrases, backup.phrases ?? []);
  await Promise.all([saveVocab(mergedVocab), savePhrases(mergedPhrases)]);

  // Preferences come across, but this build's own keys and Pro state stay.
  if (backup.settings) {
    await saveSettings({
      ...settings,
      ...backup.settings,
      anthropicKey: settings.anthropicKey,
      openaiKey: settings.openaiKey,
      isPro: settings.isPro,
    });
  }
  for (const scope of QUIZ_SCOPES) {
    const prefs = backup.quiz?.[scope];
    if (prefs) await saveQuizPrefs(scope, prefs);
  }

  return {
    vocab: mergedVocab.length - vocab.length,
    phrases: mergedPhrases.length - phrases.length,
    pinned: 0,
  };
}

// Open a file chooser and merge the picked backup. Returns null when the dialog
// was dismissed; throws with `invalidMessage` when the file isn't a backup.
export function importBackup(invalidMessage: string): Promise<ImportResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    // Cancel fires on dismissal in Chromium; without it the promise would hang
    // for good if the user closes the dialog.
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const parsed = JSON.parse(await file.text());
        if (!isBackup(parsed)) throw new Error(invalidMessage);
        resolve(await applyBackup(parsed));
      } catch (e: any) {
        reject(e instanceof SyntaxError ? new Error(invalidMessage) : e);
      }
    };
    input.click();
  });
}
