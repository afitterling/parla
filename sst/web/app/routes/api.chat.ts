import type { ActionFunctionArgs } from '@remix-run/node';
import { chat } from '~/core/openai.server';
import { findLanguage } from '~/core/languages';
import type { ChatTurn } from '~/core/types';

// POST /api/chat — the dialogue turn. Replaces the direct OpenAI call the
// iOS/desktop clients make, so the API key never leaves the server.
//
// SCAFFOLD: no rate limiting and no auth yet — see the TODOs below. Do not
// deploy this publicly as-is; it would let anyone spend against the key.
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // TODO: authenticate the caller (README open question 1).
  // TODO: enforce the free tier here. The clients keep the 5/hour quota in
  // storage.ts, but a client-side quota is unenforceable on the web — the
  // limit has to be counted server-side per user before this call is made.

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { goalLanguage, inputLanguage, mode, history, wantPinyin } = body as {
    goalLanguage: string;
    inputLanguage: string;
    mode: 'ask' | 'free';
    history: ChatTurn[];
    wantPinyin: boolean;
  };

  try {
    const reply = await chat(
      findLanguage(goalLanguage),
      findLanguage(inputLanguage),
      mode === 'ask' ? 'ask' : 'free',
      Array.isArray(history) ? history : [],
      !!wantPinyin
    );
    return Response.json(reply);
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Dialog error' }, { status: 502 });
  }
}
