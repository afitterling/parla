/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Privileged storage bridge exposed by the preload script (see src/preload).
interface ParlaBridge {
  read(name: string): Promise<string | null>;
  write(name: string, content: string): Promise<void>;
  info(): Promise<{
    version: string;
    dataDir: string;
    icloud: boolean;
    platform: string;
    electron: string;
  }>;
}

interface Window {
  parla?: ParlaBridge;
}
