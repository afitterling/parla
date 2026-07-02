import { contextBridge, ipcRenderer } from 'electron';

// Minimal privileged bridge: the renderer persists JSON blobs through the main
// process so data can live in the user's iCloud Drive folder (see main/index.ts).
// Everything else (fetch, MediaRecorder, speechSynthesis) uses standard web APIs.
const parla = {
  read: (name: string): Promise<string | null> => ipcRenderer.invoke('parla:read', name),
  write: (name: string, content: string): Promise<void> =>
    ipcRenderer.invoke('parla:write', name, content),
  info: (): Promise<{
    version: string;
    dataDir: string;
    platform: string;
    electron: string;
  }> => ipcRenderer.invoke('parla:info'),
};

contextBridge.exposeInMainWorld('parla', parla);

export type ParlaBridge = typeof parla;
