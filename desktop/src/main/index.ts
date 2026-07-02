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

// The shared container the iOS app owns (bundle id com.afitterling.sprachapp →
// container iCloud.com.afitterling.sprachapp → this on-disk folder name).
const CONTAINER_DIR = join(MOBILE_DOCS, 'iCloud~com~afitterling~sprachapp', 'Documents');

// Where older desktop builds stored data (top-level iCloud Drive). Migrated once.
const LEGACY_DIR = join(MOBILE_DOCS, 'com~apple~CloudDocs', 'Parla');

const DATA_FILES = ['vocab.json', 'phrases.json', 'settings.json', 'usage.json'];

let dataDirPromise: Promise<string> | null = null;

// One-time copy of any legacy files into the shared container, without clobbering
// files already there (the container copy wins).
async function migrateLegacy(target: string): Promise<void> {
  try {
    await fs.access(LEGACY_DIR);
  } catch {
    return; // nothing to migrate
  }
  for (const name of DATA_FILES) {
    const from = join(LEGACY_DIR, name);
    const to = join(target, name);
    try {
      await fs.access(to);
      continue; // already present in the container — don't overwrite
    } catch {
      // not present yet → copy if the legacy file exists
    }
    try {
      await fs.copyFile(from, to);
    } catch {
      // legacy file missing → skip
    }
  }
}

async function resolveDataDir(): Promise<string> {
  // Only use iCloud if the base exists (i.e. iCloud Drive is enabled on this Mac).
  try {
    await fs.access(MOBILE_DOCS);
    await fs.mkdir(CONTAINER_DIR, { recursive: true });
    await migrateLegacy(CONTAINER_DIR);
    return CONTAINER_DIR;
  } catch {
    const fallback = join(app.getPath('userData'), 'Parla');
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }
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

  ipcMain.handle('parla:info', async () => ({
    version: app.getVersion(),
    dataDir: await dataDir(),
    platform: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim(),
    electron: process.versions.electron,
  }));
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

  // Grant microphone access to the renderer (needed for MediaRecorder).
  const micPermissions = ['media', 'audioCapture'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(micPermissions.includes(permission));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
