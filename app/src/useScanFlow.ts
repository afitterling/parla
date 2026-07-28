import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { captureImageBase64, ScanSource, SCAN_PERMISSION_DENIED } from './scan';

// Drives the "add from image" (OCR) flow shared by the Vocabulary and Phrases
// screens: it enforces the paywall, lets the user pick camera or library, runs
// the caller-supplied vision extractor on the captured image, hands the results
// back to be saved, and reports the outcome. The screen renders <BusyOverlay>
// off `busy` and <Paywall> off `showPaywall`; everything else lives here so the
// two screens stay identical in behaviour.
export function useScanFlow<T>(params: {
  // True when a Release/non-Pro build must gate the feature behind the paywall.
  paywallActive: boolean;
  // Read the entries off the image. Receives base64 JPEG + a cancel signal.
  extract: (base64: string, signal: AbortSignal) => Promise<T[]>;
  // Persist the found entries (de-duplication happens in the store).
  add: (items: T[]) => void;
  labels: {
    menuTitle: string;
    camera: string;
    library: string;
    cancel: string;
    reading: string; // busy overlay label
    none: string; // shown when no usable text was found
    added: (count: number) => string;
    permission: string; // OS access refused
  };
}) {
  const { paywallActive, extract, add, labels } = params;
  const [busy, setBusy] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run(source: ScanSource) {
    let base64: string | null;
    try {
      base64 = await captureImageBase64(source);
    } catch (e: any) {
      if (e?.message === SCAN_PERMISSION_DENIED) Alert.alert(labels.menuTitle, labels.permission);
      else Alert.alert(labels.menuTitle, e?.message ?? String(e));
      return;
    }
    if (!base64) return; // user cancelled the picker

    setBusy(labels.reading);
    abortRef.current = new AbortController();
    try {
      const items = await extract(base64, abortRef.current.signal);
      if (items.length === 0) {
        Alert.alert(labels.menuTitle, labels.none);
        return;
      }
      add(items);
      Alert.alert(labels.menuTitle, labels.added(items.length));
    } catch (e: any) {
      if (e?.message !== 'Abgebrochen.') Alert.alert(labels.menuTitle, e?.message ?? String(e));
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  // Entry point for the scan button: gate first, then offer camera vs. library.
  function open() {
    if (paywallActive) {
      setShowPaywall(true);
      return;
    }
    Alert.alert(labels.menuTitle, undefined, [
      { text: labels.camera, onPress: () => run('camera') },
      { text: labels.library, onPress: () => run('library') },
      { text: labels.cancel, style: 'cancel' },
    ]);
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(null);
  }

  return { busy, showPaywall, closePaywall: () => setShowPaywall(false), open, cancel };
}
