import type { ActionFunctionArgs } from '@remix-run/node';
import { breakdown } from '~/core/openai.server';
import { findLanguage } from '~/core/languages';

// POST /api/breakdown — "word for word": split a goal-language sentence into
// its meaningful terms so each can be saved to the dictionary. Mirrors
// `breakdownSentence` in the iOS/desktop clients.
//
// SCAFFOLD: same auth/rate-limit gap as api.chat.ts.
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // TODO: authenticate + rate limit before spending on the key.

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { sentence, goalLanguage, inputLanguage, wantPinyin } = body as {
    sentence: string;
    goalLanguage: string;
    inputLanguage: string;
    wantPinyin: boolean;
  };

  try {
    const words = await breakdown(
      String(sentence ?? ''),
      findLanguage(goalLanguage),
      findLanguage(inputLanguage),
      !!wantPinyin
    );
    return Response.json({ words });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Breakdown failed' }, { status: 502 });
  }
}
