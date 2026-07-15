// DynamoDB-backed persistence — the real cross-device story for the web client.
//
// SCAFFOLD: intentionally unimplemented. Every function here is blocked on the
// same open question: what is a `userId`? Parla has no accounts today; iOS and
// desktop both sync through the user's own iCloud container, which the web
// cannot reach. See README open question 1.
//
// The table is already declared (sst.config.ts → sst.aws.Dynamo('ParlaData'))
// with `userId` (PK) + `sk` (SK), e.g. `vocab#<id>` / `phrase#<id>` / `settings`.
// Once auth exists, implement against Resource.ParlaData.name.
import type { PhraseItem, Settings, VocabItem } from './types';

const NOT_IMPLEMENTED =
  'storage.server is not implemented — Parla has no accounts yet (README open question 1).';

export async function loadVocab(_userId: string): Promise<VocabItem[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function saveVocab(_userId: string, _items: VocabItem[]): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function loadPhrases(_userId: string): Promise<PhraseItem[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function savePhrases(_userId: string, _items: PhraseItem[]): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function loadSettings(_userId: string): Promise<Settings> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function saveSettings(_userId: string, _s: Settings): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}
