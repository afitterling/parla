import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';

// ── Data location ─────────────────────────────────────────────────────────────
// Parla persists vocab / phrases / settings / usage as JSON files. We store them
// in the iOS app's iCloud "Documents" container so the data syncs across the
// user's Macs AND with the iPhone/iPad app, which reads/writes the same files.
// If iCloud is unavailable (signed out, or non-macOS), we fall back to Electron's
// per-user data directory.
const MOBILE_DOCS = join(homedir(), 'Library', 'Mobile Documents');

// Which iOS app's iCloud "Documents" container we share. Must match the
// `com.apple.developer.ubiquity-container-identifiers` entitlement of the iOS
// build you want to sync with (NOT merely its bundle id — the container id is a
// separate value, though it conventionally mirrors the bundle id as
// `iCloud.<bundleid>`). Override per build via the `MAIN_VITE_ICLOUD_CONTAINER`
// env var (see desktop/.env); defaults to the production container.
//
// NOTE: the Electron app only reads/writes the on-disk container FOLDER — it
// cannot itself register a syncing iCloud container. The folder only exists and
// syncs to your phone once a real iCloud-entitled app (the iOS build with this
// exact container id) has created it and iCloud Drive is on for the same Apple
// ID. Pointing here at a container no iOS build owns gives a local-only folder.
const CONTAINER_ID = (
  (import.meta as any).env?.MAIN_VITE_ICLOUD_CONTAINER || 'iCloud.tech.sp33c.parla'
)
  .toString()
  .trim();

// Container id → on-disk folder name (dots become tildes):
// `iCloud.tech.sp33c.parla.dev` → `iCloud~tech~sp33c~parla~dev`.
const CONTAINER_DIR = join(MOBILE_DOCS, CONTAINER_ID.replace(/\./g, '~'), 'Documents');

// Prior data locations, migrated once (non-clobbering) into the active container
// so switching container ids — or upgrading from an old desktop build — keeps
// your words/phrases. Order = lowest priority first.
const MIGRATION_SOURCES = [
  join(MOBILE_DOCS, 'com~apple~CloudDocs', 'Parla'), // very old top-level iCloud Drive folder
  join(MOBILE_DOCS, 'iCloud~com~afitterling~sprachapp', 'Documents'), // pre-rename container
];

const DATA_FILES = ['vocab.json', 'phrases.json', 'settings.json', 'usage.json', 'quiz.json'];

let dataDirPromise: Promise<string> | null = null;

// Nothing in the renderer can paint until the data directory resolves, and every
// step below talks to iCloud — which can stall for a long time, or forever, when
// a file is an evicted placeholder that has to be downloaded first. Bound the
// waits so a slow or wedged iCloud degrades instead of hanging on a spinner.
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const MIGRATION_TIMEOUT_MS = 5000;
const CONTAINER_TIMEOUT_MS = 10000;

// One-time copy of any prior-location files into the active container, without
// clobbering files already there (the active container copy wins).
async function migrateInto(target: string): Promise<void> {
  for (const source of MIGRATION_SOURCES) {
    if (source === target) continue; // don't copy a container onto itself
    try {
      await fs.access(source);
    } catch {
      continue; // this source doesn't exist
    }
    for (const name of DATA_FILES) {
      const to = join(target, name);
      try {
        await fs.access(to);
        continue; // already present in the active container — don't overwrite
      } catch {
        // not present yet → copy if the source file exists
      }
      try {
        await fs.copyFile(join(source, name), to);
      } catch {
        // source file missing → skip
      }
    }
  }
}

async function resolveDataDir(): Promise<string> {
  // Only use iCloud if the base exists (i.e. iCloud Drive is enabled on this Mac).
  try {
    await withTimeout(
      (async () => {
        await fs.access(MOBILE_DOCS);
        await fs.mkdir(CONTAINER_DIR, { recursive: true });
      })(),
      CONTAINER_TIMEOUT_MS,
      'iCloud container'
    );
  } catch {
    // iCloud is off, or wedged long enough that it may as well be. Fall back to
    // local storage — Settings shows this as sync-off rather than hiding it.
    const fallback = join(app.getPath('userData'), 'Parla');
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }

  // Migration is best-effort and deliberately does NOT gate the container: files
  // it copies come from an evicted iCloud folder that may need downloading, and
  // waiting on that is what makes a first launch look frozen. Time out and carry
  // on with an empty container — Settings → Backup imports a library on purpose.
  try {
    await withTimeout(migrateInto(CONTAINER_DIR), MIGRATION_TIMEOUT_MS, 'iCloud migration');
  } catch (err) {
    console.warn('[parla] skipping migration:', err);
  }
  return CONTAINER_DIR;
}

function dataDir(): Promise<string> {
  if (!dataDirPromise) dataDirPromise = resolveDataDir();
  return dataDirPromise;
}

// Guard against path traversal — callers only ever pass a bare file name.
function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!base || base.startsWith('.')) throw new Error(`Invalid storage key: ${name}`);
  return base;
}

function registerStorageIpc(): void {
  ipcMain.handle('parla:read', async (_e, name: string) => {
    const file = join(await dataDir(), safeName(name));
    try {
      return await fs.readFile(file, 'utf8');
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  });

  ipcMain.handle('parla:write', async (_e, name: string, content: string) => {
    const dir = await dataDir();
    const file = join(dir, safeName(name));
    // Write atomically so an interrupted/syncing write can't corrupt the file.
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, file);
  });

  ipcMain.handle('parla:info', async () => {
    const dir = await dataDir();
    return {
      version: app.getVersion(),
      dataDir: dir,
      // True when data lives in the shared iCloud container (cross-device sync
      // active), false when we fell back to the local userData directory.
      icloud: dir === CONTAINER_DIR,
      platform: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim(),
      electron: process.versions.electron,
    };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 460,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0B0B0F',
    title: 'Parla',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Local personal app: allow the renderer to call the OpenAI API directly
      // (OpenAI does not send permissive CORS headers for browser origins).
      webSecurity: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Open external links in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerStorageIpc();

  // Grant microphone access (MediaRecorder) and geolocation (Emergency mode) to
  // the renderer.
  const allowedPermissions = ['media', 'audioCapture', 'geolocation'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.includes(permission));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
