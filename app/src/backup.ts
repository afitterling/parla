// Full backup: every store the app owns in one JSON file.
//
// The per-screen exports in export.ts are for reading elsewhere (Anki, a
// spreadsheet); this one is for moving a library between installs. That matters
// because the local mirror lives in the app sandbox, which is keyed by bundle
// id: a build with a different id starts with an empty library, and only picks
// the old one up again if iCloud is signed in. Export/import is the path that
// does not depend on iCloud.
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  loadPhrases,
  loadPinned,
  loadQuizPrefs,
  loadSettings,
  loadVocab,
  mergeById,
  PhraseItem,
  DialogMsg,
  QuizPrefs,
  QuizScope,
  savePhrases,
  savePinned,
  saveQuizPrefs,
  saveSettings,
  saveVocab,
  Settings,
  VocabItem,
} from './storage';

const FORMAT = 'parla.backup';
const FORMAT_VERSION = 1;
const QUIZ_SCOPES: QuizScope[] = ['vocab', 'phrases', 'train'];

// Preferences travel; the API keys and the Pro flag deliberately do not. A
// backup file gets mailed and AirDropped around, and Pro belongs to the store
// account rather than to the data.
type BackupSettings = Omit<Settings, 'anthropicKey' | 'openaiKey' | 'isPro'>;

export type Backup = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  source: { app: string; version: string; bundleId: string };
  vocab: VocabItem[];
  phrases: PhraseItem[];
  pinned: DialogMsg[];
  settings: BackupSettings;
  quiz: Partial<Record<QuizScope, QuizPrefs>>;
};

// How much an import actually added, per store — shown back to the user so
// "imported" is a number rather than a claim.
export type ImportResult = { vocab: number; phrases: number; pinned: number };

function stripSecrets(s: Settings): BackupSettings {
  const { anthropicKey: _a, openaiKey: _o, isPro: _p, ...rest } = s;
  return rest;
}

export async function buildBackup(): Promise<Backup> {
  const [vocab, phrases, pinned, settings] = await Promise.all([
    loadVocab(),
    loadPhrases(),
    loadPinned(),
    loadSettings(),
  ]);
  const quizEntries = await Promise.all(
    QUIZ_SCOPES.map(async (scope) => [scope, await loadQuizPrefs(scope)] as const)
  );
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      app: 'Parla',
      version: String(Constants.expoConfig?.version ?? ''),
      bundleId: String(Constants.expoConfig?.ios?.bundleIdentifier ?? ''),
    },
    vocab,
    phrases,
    pinned,
    settings: stripSecrets(settings),
    quiz: Object.fromEntries(quizEntries),
  };
}

// Write the backup into the cache and hand it to the share sheet, so it can be
// saved to Files/iCloud Drive, AirDropped or mailed to yourself.
export async function exportBackup(dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const backup = await buildBackup();
  const day = backup.exportedAt.slice(0, 10);
  const file = new File(Paths.cache, `parla-backup-${day}.json`);
  if (file.exists) file.delete(); // overwrite any prior export from today
  file.create();
  file.write(JSON.stringify(backup, null, 2));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle,
  });
}

function isBackup(value: any): value is Backup {
  return !!value && value.format === FORMAT && Array.isArray(value.vocab);
}

// Merge a parsed backup into the current stores. Merging (not replacing) is the
// safe direction: mergeById never drops an item that exists on either side, so
// importing into a library that already has content cannot lose anything — the
// same rule the iCloud sync uses.
export async function applyBackup(backup: Backup): Promise<ImportResult> {
  const [vocab, phrases, pinned, settings] = await Promise.all([
    loadVocab(),
    loadPhrases(),
    loadPinned(),
    loadSettings(),
  ]);

  const mergedVocab = mergeById(vocab, backup.vocab ?? []);
  const mergedPhrases = mergeById(phrases, backup.phrases ?? []);
  const mergedPinned = mergeById(pinned, backup.pinned ?? []);

  await Promise.all([
    saveVocab(mergedVocab),
    savePhrases(mergedPhrases),
    savePinned(mergedPinned),
  ]);

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
    pinned: mergedPinned.length - pinned.length,
  };
}

// Pick a backup file and merge it in. Returns null when the picker was
// dismissed; throws with `invalidMessage` when the file isn't a Parla backup.
export async function importBackup(invalidMessage: string): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Some sources hand JSON over as text/plain or octet-stream, so accept
    // anything and let the parse decide.
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return null;
  const asset = picked.assets?.[0];
  if (!asset) return null;

  const raw = await new File(asset.uri).text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(invalidMessage);
  }
  if (!isBackup(parsed)) throw new Error(invalidMessage);
  return applyBackup(parsed);
}
