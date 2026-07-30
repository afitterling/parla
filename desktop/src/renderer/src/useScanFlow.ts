import { useRef, useState } from 'react';

// Read one picked image file as a base64 JPEG/PNG payload (no data: prefix),
// ready to hand to the vision API. Resolves null when the dialog is dismissed.
function pickImageBase64(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Chromium fires no event on cancel, so the picker element is simply
    // dropped when the window regains focus without a file.
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const result = String(reader.result ?? '');
        const comma = result.indexOf(',');
        resolve(comma === -1 ? null : result.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

// Drives the "add from image" (OCR) flow shared by the Vocabulary and Phrases
// screens: it enforces the paywall, picks an image, runs the caller-supplied
// vision extractor on it, hands the results back to be saved, and reports the
// outcome. The screen renders <BusyOverlay> off `busy` and <Paywall> off
// `showPaywall`; everything else lives here so the two screens stay identical
// in behaviour — same split as the phone app.
export function useScanFlow<T>(params: {
  // True when a Release/non-Pro build must gate the feature behind the paywall.
  paywallActive: boolean;
  // Read the entries off the image. Receives base64 image + a cancel signal.
  extract: (base64: string, signal: AbortSignal) => Promise<T[]>;
  // Persist the found entries (de-duplication happens in the store).
  add: (items: T[]) => void;
  labels: {
    menuTitle: string;
    reading: string; // busy overlay label
    none: string; // shown when no usable text was found
    added: (count: number) => string;
  };
}) {
  const { paywallActive, extract, add, labels } = params;
  const [busy, setBusy] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Entry point for the scan button: gate first, then pick a file and read it.
  async function open() {
    if (paywallActive) {
      setShowPaywall(true);
      return;
    }
    let base64: string | null;
    try {
      base64 = await pickImageBase64();
    } catch (e: any) {
      window.alert(e?.message ?? String(e));
      return;
    }
    if (!base64) return; // dialog dismissed

    setBusy(labels.reading);
    abortRef.current = new AbortController();
    try {
      const items = await extract(base64, abortRef.current.signal);
      if (items.length === 0) {
        window.alert(labels.none);
        return;
      }
      add(items);
      window.alert(labels.added(items.length));
    } catch (e: any) {
      if (e?.message !== 'Abgebrochen.') window.alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(null);
  }

  return { busy, showPaywall, closePaywall: () => setShowPaywall(false), open, cancel };
}
