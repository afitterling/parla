// Stroke-order data for Han characters (Chinese, and Japanese kanji).
//
// Data comes from `hanzi-writer-data` (Make Me a Hanzi, ~9000 characters), one
// small JSON per character, pulled from the jsDelivr CDN the first time a
// character is opened and then cached on device — so a word that was looked up
// once keeps working offline.
//
// The JSON gives, per stroke, an SVG outline (`strokes`, a filled shape) and a
// median line (`medians`, the pen path through the middle of that shape). The
// animation draws a stroke by clipping its outline with the fat-stroked median,
// which is how Hanzi Writer does it. Coordinates live in a 1024×1024 box with
// the y axis pointing up — see TRANSFORM below.
import { Directory, File, Paths } from 'expo-file-system';

export type StrokeData = {
  strokes: string[]; // SVG path `d` per stroke (filled outline)
  medians: number[][][]; // [stroke][point][x, y]
};

// The hanzi-writer coordinate system is 1024 wide with y growing upwards and a
// 900-unit baseline offset. Applied to the whole glyph group when rendering.
export const STROKE_VIEWBOX = 1024;
export const STROKE_TRANSFORM = 'scale(1, -1) translate(0, -900)';

const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0';
const CACHE_DIR = 'strokes';

// Han characters: CJK Unified Ideographs + Extension A + Compatibility Ideographs.
// (Extension B and beyond are outside hanzi-writer-data's coverage anyway.)
const HAN = /[㐀-䶿一-鿿豈-﫿]/;

export function hasHanzi(text: string): boolean {
  return HAN.test(text);
}

// The individual Han characters of a term, in order, duplicates kept — a word
// like 谢谢 is drawn twice because the learner writes it twice.
export function hanziChars(text: string): string[] {
  return Array.from(text).filter((c) => HAN.test(c));
}

// Session cache so flipping between characters in the modal doesn't hit disk.
// `null` means "we already know there is no data for this character".
const memory = new Map<string, StrokeData | null>();

function cacheFile(char: string): File {
  // Codepoint as the filename — the raw character would be fine on iOS but the
  // hex form avoids any normalization surprises.
  const name = `${char.codePointAt(0)!.toString(16)}.json`;
  return new File(Paths.cache, CACHE_DIR, name);
}

function isStrokeData(value: any): value is StrokeData {
  return (
    !!value &&
    Array.isArray(value.strokes) &&
    Array.isArray(value.medians) &&
    value.strokes.length > 0
  );
}

// Load one character's stroke data: memory → disk cache → network.
// Returns null when the character isn't in the dataset or we're offline with a
// cold cache, so the UI can say "no stroke data" instead of failing.
export async function loadStrokeData(char: string): Promise<StrokeData | null> {
  if (memory.has(char)) return memory.get(char)!;

  const file = cacheFile(char);
  if (file.exists) {
    try {
      const cached = JSON.parse(file.textSync());
      if (isStrokeData(cached)) {
        memory.set(char, cached);
        return cached;
      }
    } catch {
      // Corrupt cache entry — fall through and re-fetch.
    }
  }

  try {
    const res = await fetch(`${CDN}/${encodeURIComponent(char)}.json`);
    if (!res.ok) {
      // 404 → the dataset simply doesn't have this character. Remember that.
      if (res.status === 404) memory.set(char, null);
      return null;
    }
    const data = await res.json();
    if (!isStrokeData(data)) {
      memory.set(char, null);
      return null;
    }
    memory.set(char, data);
    try {
      const dir = new Directory(Paths.cache, CACHE_DIR);
      if (!dir.exists) dir.create({ intermediates: true });
      file.create({ intermediates: true, overwrite: true });
      file.write(JSON.stringify(data));
    } catch {
      // Cache write failed (disk full, sandbox hiccup) — the data is still
      // usable for this session.
    }
    return data;
  } catch {
    // Offline / network error — don't remember it, a later try may succeed.
    return null;
  }
}

// Rough length of a median polyline, used to scale both the dash animation and
// how long a stroke takes to draw (long strokes should not feel rushed).
export function medianLength(median: number[][]): number {
  let total = 0;
  for (let i = 1; i < median.length; i++) {
    const [x1, y1] = median[i - 1];
    const [x2, y2] = median[i];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

// Median points → an SVG polyline `d`, the path we stroke fat to reveal a stroke.
export function medianPath(median: number[][]): string {
  if (median.length === 0) return '';
  const [first, ...rest] = median;
  return `M ${first[0]} ${first[1]}` + rest.map(([x, y]) => ` L ${x} ${y}`).join('');
}
