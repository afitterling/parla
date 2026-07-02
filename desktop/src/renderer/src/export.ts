// Export vocabulary and phrases to a downloadable file. Two formats:
//   - CSV: a flat table (Anki / spreadsheet import). UTF-8 BOM-prefixed so Excel
//     reads Chinese characters and Pinyin correctly.
//   - JSON: the raw records, for backup / re-import.
// On desktop we trigger a normal browser download via an object URL.
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
  const header = [
    'term',
    'pinyin',
    'translation',
    'example',
    'examplePinyin',
    'exampleTranslation',
    'lang',
    'createdAt',
  ];
  const rows = items.map((v) =>
    csvRow([
      v.term,
      v.pinyin,
      v.translation,
      v.example,
      v.examplePinyin,
      v.exampleTranslation,
      v.lang,
      isoDate(v.createdAt),
    ])
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

// Trigger a browser download of `content` as `filename`.
function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportVocab(items: VocabItem[], lang: string, format: ExportFormat): void {
  if (format === 'csv') {
    download(`parla-vocab-${lang}.csv`, BOM + vocabToCsv(items), 'text/csv');
    return;
  }
  download(`parla-vocab-${lang}.json`, JSON.stringify(items, null, 2), 'application/json');
}

export function exportPhrases(items: PhraseItem[], lang: string, format: ExportFormat): void {
  if (format === 'csv') {
    download(`parla-phrases-${lang}.csv`, BOM + phrasesToCsv(items), 'text/csv');
    return;
  }
  download(`parla-phrases-${lang}.json`, JSON.stringify(items, null, 2), 'application/json');
}
