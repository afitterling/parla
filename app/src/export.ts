// Export vocabulary and phrases to a shareable file. Two formats:
//   - CSV: a flat table (Anki / spreadsheet import). UTF-8 BOM-prefixed so Excel
//     reads Chinese characters and Pinyin correctly.
//   - JSON: the raw records, for backup / re-import.
// Files are written into the cache directory (SDK 56 File API) and handed to the
// native share sheet via expo-sharing.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PhraseItem, VocabItem } from './storage';

export type ExportFormat = 'csv' | 'json';

// UTF-8 byte-order mark so Excel opens CSVs with non-Latin scripts correctly.
const BOM = '﻿';

// RFC 4180: quote a cell if it contains a comma, quote, or newline; double up
// any embedded quotes.
function csvCell(value: string | number | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString();
}

function vocabToCsv(items: VocabItem[]): string {
  const header = ['term', 'pinyin', 'translation', 'example', 'lang', 'createdAt'];
  const rows = items.map((v) =>
    csvRow([v.term, v.pinyin, v.translation, v.example, v.lang, isoDate(v.createdAt)])
  );
  return [csvRow(header), ...rows].join('\n');
}

function phrasesToCsv(items: PhraseItem[]): string {
  const header = ['target', 'pinyin', 'translation', 'tags', 'lang', 'reviews', 'known', 'createdAt'];
  const rows = items.map((p) =>
    csvRow([
      p.target,
      p.pinyin,
      p.translation,
      p.tags.join('; '),
      p.lang,
      p.reviews,
      p.known,
      isoDate(p.createdAt),
    ])
  );
  return [csvRow(header), ...rows].join('\n');
}

// Write `content` to a fresh cache file and open the system share sheet.
async function shareText(
  filename: string,
  content: string,
  mimeType: string,
  uti: string,
  dialogTitle: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete(); // overwrite any prior export of the same name
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle });
}

export async function exportVocab(
  items: VocabItem[],
  lang: string,
  format: ExportFormat,
  dialogTitle: string
): Promise<void> {
  if (format === 'csv') {
    return shareText(
      `parla-vocab-${lang}.csv`,
      BOM + vocabToCsv(items),
      'text/csv',
      'public.comma-separated-values-text',
      dialogTitle
    );
  }
  return shareText(
    `parla-vocab-${lang}.json`,
    JSON.stringify(items, null, 2),
    'application/json',
    'public.json',
    dialogTitle
  );
}

export async function exportPhrases(
  items: PhraseItem[],
  lang: string,
  format: ExportFormat,
  dialogTitle: string
): Promise<void> {
  if (format === 'csv') {
    return shareText(
      `parla-phrases-${lang}.csv`,
      BOM + phrasesToCsv(items),
      'text/csv',
      'public.comma-separated-values-text',
      dialogTitle
    );
  }
  return shareText(
    `parla-phrases-${lang}.json`,
    JSON.stringify(items, null, 2),
    'application/json',
    'public.json',
    dialogTitle
  );
}
