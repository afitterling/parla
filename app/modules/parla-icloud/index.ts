// JS surface for the ParlaICloud native module. The module reads/writes JSON
// files in the app's iCloud "Documents" ubiquity container so vocabulary and
// phrases sync across the user's devices — and with the Mac (Electron) app, which
// reads/writes the same container.
//
// Everything degrades gracefully: on a device/build without the native module
// linked (web, Expo Go, iCloud signed out), the calls no-op and storage falls
// back to the local AsyncStorage mirror.
import { requireOptionalNativeModule } from 'expo-modules-core';

type ParlaICloudNative = {
  isAvailable(): Promise<boolean>;
  containerId(): string;
  readFile(name: string): Promise<string | null>;
  writeFile(name: string, content: string): Promise<void>;
};

const native = requireOptionalNativeModule<ParlaICloudNative>('ParlaICloud');

// Whether the native module is compiled into this build at all.
export function isLinked(): boolean {
  return native != null;
}

// Whether iCloud is actually usable right now (container resolves — i.e. the user
// is signed into iCloud with Drive enabled).
export async function isAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
}

// Which iCloud container this build reads and writes. Empty when the native
// module isn't linked (web, Expo Go) — there is no container at all then.
export function containerId(): string {
  try {
    return native?.containerId() ?? '';
  } catch {
    return '';
  }
}

export async function readFile(name: string): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.readFile(name);
  } catch {
    return null;
  }
}

export async function writeFile(name: string, content: string): Promise<void> {
  if (!native) return;
  await native.writeFile(name, content);
}
