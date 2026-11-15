// Keeps Parla and the relay in step while the user is signed in:
//  - on launch, on returning to the foreground and once a minute while open,
//    picks up the words agents asked for and adds them;
//  - a few seconds after the library changes, pushes the new projection so an
//    agent reads what is really there.
// Signed out, it does nothing at all and nothing leaves the device.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { applyPhraseRequest, applyVocabRequest } from './agentIntents';
import {
  createPairing,
  drain,
  Intent,
  loadSession,
  projectionOf,
  pushProjection,
  RelaySession,
  relayUrl,
  signInWithApple,
  signOut as relaySignOut,
  SignedOut,
} from './relay';
import { PhraseItem, savePhrases, saveVocab, Settings, VocabItem } from './storage';

const POLL_MS = 60_000;
const PUSH_DEBOUNCE_MS = 3_000;

export type RelayState = {
  /** False when this build has no relay address. */
  configured: boolean;
  session: RelaySession | null;
  busy: boolean;
  lastSync: number | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  pair: () => Promise<{ code: string; expiresAt: string }>;
  syncNow: () => Promise<void>;
};

export function useRelay(opts: {
  ready: boolean;
  settings: Settings | null;
  vocab: VocabItem[];
  phrases: PhraseItem[];
  setVocab: (next: VocabItem[]) => void;
  setPhrases: (next: PhraseItem[]) => void;
}): RelayState {
  const { ready, settings, vocab, phrases } = opts;
  const configured = !!relayUrl();
  const [session, setSession] = useState<RelaySession | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The latest library, readable from inside async work without stale closures.
  const latest = useRef({ settings, vocab, phrases, setVocab: opts.setVocab, setPhrases: opts.setPhrases });
  latest.current = { settings, vocab, phrases, setVocab: opts.setVocab, setPhrases: opts.setPhrases };
  const lastPushed = useRef<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!configured) return;
    loadSession().then(setSession).catch(() => setSession(null));
  }, [configured]);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof SignedOut) {
      setSession(null);
      lastPushed.current = null;
      return;
    }
    setError(String((e as Error)?.message ?? e));
  }, []);

  // Applies one request to the newest library and saves it. Counts come from
  // the same pure function the state update runs, so what is reported back to
  // the agent is what the user sees.
  const apply = useCallback((intent: Intent) => {
    const now = Date.now();
    const lib = latest.current;
    if (intent.operation === 'add-vocab') {
      const result = applyVocabRequest(lib.vocab, intent.id, intent.arguments, intent.source, now);
      if (result.added > 0) {
        lib.vocab = result.next;
        lib.setVocab(result.next);
        saveVocab(result.next);
      }
      return { added: result.added, skipped: result.skipped };
    }
    if (intent.operation === 'add-phrases') {
      const result = applyPhraseRequest(lib.phrases, intent.id, intent.arguments, intent.source, now);
      if (result.added > 0) {
        lib.phrases = result.next;
        lib.setPhrases(result.next);
        savePhrases(result.next);
      }
      return { added: result.added, skipped: result.skipped };
    }
    throw new Error(`This version of Parla cannot do "${intent.operation}". Update the app.`);
  }, []);

  const push = useCallback(async (current: RelaySession) => {
    const lib = latest.current;
    if (!lib.settings) return;
    const projection = projectionOf(lib.settings, lib.vocab, lib.phrases);
    const body = JSON.stringify(projection);
    if (body === lastPushed.current) return;
    await pushProjection(current, projection);
    lastPushed.current = body;
  }, []);

  const cycle = useCallback(
    async (current: RelaySession | null) => {
      if (!current || running.current || !latest.current.settings) return;
      running.current = true;
      try {
        await drain(current, apply);
        await push(current);
        setLastSync(Date.now());
        setError(null);
      } catch (e) {
        handleError(e);
      } finally {
        running.current = false;
      }
    },
    [apply, push, handleError]
  );

  // Launch, foreground, and a slow poll while the app is open.
  useEffect(() => {
    if (!ready || !session) return;
    cycle(session);
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => cycle(session), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        cycle(session);
        if (!timer) timer = setInterval(() => cycle(session), POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [ready, session, cycle]);

  // Push a little after the library or the languages change.
  const languages = settings ? `${settings.inputLanguage}|${settings.goalLanguage}|${settings.learnLanguages.join(',')}` : '';
  useEffect(() => {
    if (!ready || !session) return;
    const timer = setTimeout(() => {
      push(session).catch(handleError);
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ready, session, vocab, phrases, languages, push, handleError]);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await signInWithApple();
      if (next) {
        lastPushed.current = null;
        setSession(next);
      }
    } catch (e) {
      handleError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [handleError]);

  const signOut = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await relaySignOut(session);
      setSession(null);
      setLastSync(null);
      lastPushed.current = null;
    } catch (e) {
      handleError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [session, handleError]);

  const pair = useCallback(async () => {
    if (!session) throw new Error('Sign in first.');
    try {
      // Make sure the agent finds a current library the moment it connects.
      await push(session);
      return await createPairing(session);
    } catch (e) {
      handleError(e);
      throw e;
    }
  }, [session, push, handleError]);

  const syncNow = useCallback(async () => {
    setBusy(true);
    try {
      await cycle(session);
    } finally {
      setBusy(false);
    }
  }, [session, cycle]);

  return { configured, session, busy, lastSync, error, signIn, signOut, pair, syncNow };
}
