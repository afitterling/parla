import type { ActionFunctionArgs } from '@remix-run/node';

// POST /api/transcribe — Whisper transcription of a recorded utterance.
//
// SCAFFOLD: deliberately not implemented. The browser → Lambda → Whisper hop
// needs a payload strategy first (API Gateway caps bodies at ~6 MB, so a long
// recording cannot be posted inline; a presigned S3 PUT is the likely answer).
// See README open question 3, and openai.server.ts:transcribe().
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return Response.json(
    { error: 'Transcription is not wired up yet (scaffold).' },
    { status: 501 }
  );
}
