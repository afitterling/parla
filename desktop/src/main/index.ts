import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 460,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0B0B0F',
    title: 'Parla',
    titleBarStyle: 'hiddenInset',
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
  // Grant microphone access to the renderer (needed for MediaRecorder).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
