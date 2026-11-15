// The Parla relay client — Sign in with Apple, and the bridge to Claude.
//
// The relay (../../relay) lets AI agents such as Claude read the library and
// ask for new words. It never writes the library: it keeps a read-only copy
// (the "projection") that this app pushes, and a queue of requests that this
// app claims and applies through the same duplicate check as adding by hand.
// iCloud stays the only real store.
//
// The session token lives in the Keychain (expo-secure-store), never in the
// iCloud JSON files, so it does not travel to other devices.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { LANGUAGES } from './languages';
import type { PhraseItem, Settings, VocabItem } from './storage';

const SESSION_KEY = 'parla.relay.session';
const TIMEOUT_MS = 20_000;

export type RelaySession = { account: string; token: string; expiresAt: string };

export type Intent = {
  id: string;
  operation: 'add-vocab' | 'add-phrases' | string;
  arguments: Record<string, unknown>;
  source?: string;
  state: string;
  createdAt: string;
};

/** The session is gone (expired, or signed out from another device). */
export class SignedOut extends Error {}

/** Where the relay lives, from app.json → expo.extra.relayUrl. Empty = off. */
export function relayUrl(): string {
  const configured = (Constants.expoConfig?.extra as { relayUrl?: string } | undefined)?.relayUrl ?? '';
  return configured.trim().replace(/\/+$/, '');
}

/** The URL to paste into Claude as a custom connector. */
export function mcpUrl(): string {
  const base = relayUrl();
  return base ? `${base}/mcp` : '';
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !relayUrl()) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function loadSession(): Promise<RelaySession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as RelaySession;
    if (!session?.token || Date.parse(session.expiresAt) <= Date.now()) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function forgetLocally(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // nothing stored
  }
}

async function request<T>(
  path: string,
  init: { method: string; token?: string; body?: unknown },
): Promise<{ status: number; json: T }> {
  const base = relayUrl();
  if (!base) throw new Error('No relay address in this build.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (response.status === 401 && init.token) {
      await forgetLocally();
      throw new SignedOut(json?.error ?? 'Signed out.');
    }
    if (response.status >= 400 && response.status !== 409) {
      throw new Error(json?.error ?? `The relay answered ${response.status}.`);
    }
    return { status: response.status, json: json as T };
  } finally {
    clearTimeout(timer);
  }
}

/** Shows Apple's sheet, then trades the identity token for a relay session.
 *  Returns null when the user cancels. Only the opaque Apple user id reaches
 *  the relay — no name and no e-mail are requested. */
export async function signInWithApple(): Promise<RelaySession | null> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple returned no identity token.');
  const { json } = await request<RelaySession>('/v1/account', {
    method: 'POST',
    body: { identityToken: credential.identityToken },
  });
  const session = { account: json.account, token: json.token, expiresAt: json.expiresAt };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return session;
}

/** Deletes everything the relay holds for this account — the copy of the
 *  library, the queue and every connected agent — then forgets the session. */
export async function signOut(session: RelaySession): Promise<void> {
  try {
    await request('/v1/relay', { method: 'DELETE', token: session.token });
  } catch (e) {
    if (!(e instanceof SignedOut)) throw e;
  }
  await forgetLocally();
}

export async function createPairing(
  session: RelaySession
): Promise<{ code: string; expiresAt: string }> {
  const { json } = await request<{ code: string; expiresAt: string }>('/v1/relay/pairing', {
    method: 'POST',
    token: session.token,
    body: { scopes: ['vocab:read', 'vocab:write'] },
  });
  return json;
}

// ── The projection ───────────────────────────────────────────────────────────

export function projectionOf(
  settings: Settings,
  vocab: VocabItem[],
  phrases: PhraseItem[]
): Record<string, unknown> {
  return {
    inputLanguage: settings.inputLanguage,
    goalLanguage: settings.goalLanguage,
    learnLanguages: settings.learnLanguages,
    supported: LANGUAGES.map((l) => ({ code: l.code, name: l.nativeName })),
    vocab: vocab.map((v) => ({
      id: v.id,
      term: v.term,
      pinyin: v.pinyin,
      translation: v.translation,
      example: v.example,
      examplePinyin: v.examplePinyin,
      exampleTranslation: v.exampleTranslation,
      lang: v.lang,
      tags: v.tags,
      createdAt: v.createdAt,
      reviews: v.reviews,
      known: v.known,
    })),
    phrases: phrases.map((p) => ({
      id: p.id,
      target: p.target,
      pinyin: p.pinyin,
      translation: p.translation,
      lang: p.lang,
      tags: p.tags,
      createdAt: p.createdAt,
      reviews: p.reviews,
      known: p.known,
    })),
  };
}

export async function pushProjection(
  session: RelaySession,
  projection: Record<string, unknown>
): Promise<string> {
  const { json } = await request<{ asOf: string }>('/v1/relay/projection', {
    method: 'PUT',
    token: session.token,
    body: projection,
  });
  return json.asOf;
}

// ── The queue ────────────────────────────────────────────────────────────────

export type Applied = { added: number; skipped: number };

/**
 * Claims each waiting request once, hands it to `apply`, and reports back.
 * A request that `apply` throws on is reported as failed with the reason, so
 * the agent can tell the user why. Returns how many entries were added.
 */
export async function drain(
  session: RelaySession,
  apply: (intent: Intent) => Applied
): Promise<number> {
  const { json } = await request<{ intents: Intent[] }>('/v1/relay/intents', {
    method: 'GET',
    token: session.token,
  });
  let added = 0;
  for (const waiting of json.intents ?? []) {
    const claimed = await request<{ intent?: Intent }>(
      `/v1/relay/intents/${encodeURIComponent(waiting.id)}/claim`,
      { method: 'POST', token: session.token }
    );
    // 409: another device got there first.
    if (claimed.status !== 200 || !claimed.json.intent) continue;
    const intent = claimed.json.intent;
    let report: Record<string, unknown>;
    try {
      const result = apply(intent);
      added += result.added;
      report = { state: 'applied', result };
    } catch (e: any) {
      report = { state: 'failed', error: String(e?.message ?? e).slice(0, 300) };
    }
    await request(`/v1/relay/intents/${encodeURIComponent(intent.id)}/complete`, {
      method: 'POST',
      token: session.token,
      body: report,
    });
  }
  return added;
}
