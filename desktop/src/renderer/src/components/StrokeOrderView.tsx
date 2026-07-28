import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import { RotateCcw } from 'lucide-react';
import { hasHanzi } from '../languages';
import { useT } from '../i18n/I18nContext';

// Animated stroke-order view for a Han term. Each Han character gets its own
// HanziWriter instance (DOM/SVG); data is fetched from hanzi-writer's jsDelivr
// CDN the first time a character is drawn — the same dataset the mobile app
// uses. Clicking a character (or the replay button) re-runs the animation.
type Props = {
  term: string;
  size: number;
};

// Resolve a CSS custom property to a concrete color for hanzi-writer, which
// needs real color strings (not `var(--…)`).
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function StrokeOrderView({ term, size }: Props) {
  const t = useT();
  const chars = Array.from(term).filter((c) => hasHanzi(c));
  const containerRef = useRef<HTMLDivElement>(null);
  const writersRef = useRef<HanziWriter[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    host.innerHTML = '';
    writersRef.current = [];
    setFailed(false);

    const cell = Math.max(80, Math.min(size, 240));
    const strokeColor = cssVar('--text', '#f5f5f7');
    const radicalColor = cssVar('--accent2', '#22d3ee');
    const outlineColor = cssVar('--faint', '#6a6a7c');

    chars.forEach((char, i) => {
      const target = document.createElement('div');
      target.className = 'stroke-cell';
      target.style.width = `${cell}px`;
      target.style.height = `${cell}px`;
      host.appendChild(target);
      try {
        const writer = HanziWriter.create(target, char, {
          width: cell,
          height: cell,
          padding: 8,
          showOutline: true,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 250,
          strokeColor,
          radicalColor,
          outlineColor,
          charDataLoader: (c, onComplete) => {
            fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(c)}.json`)
              .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no data'))))
              .then(onComplete)
              .catch(() => setFailed(true));
          },
        });
        // Click the character to replay just that one.
        target.style.cursor = 'pointer';
        target.addEventListener('click', () => writer.animateCharacter());
        writersRef.current.push(writer);
        // Stagger the initial animations so a multi-char word draws left to right.
        window.setTimeout(() => writer.animateCharacter(), i * 700);
      } catch {
        setFailed(true);
      }
    });

    return () => {
      writersRef.current = [];
      if (host) host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, size]);

  function replay() {
    writersRef.current.forEach((w, i) => window.setTimeout(() => w.animateCharacter(), i * 700));
  }

  return (
    <div className="stroke-view">
      <div className="stroke-cells" ref={containerRef} />
      {failed ? (
        <div className="stroke-hint">{t('vocab.strokesUnavailable')}</div>
      ) : (
        <button className="stroke-replay" onClick={replay}>
          <RotateCcw size={16} />
          {t('vocab.strokesReplay')}
        </button>
      )}
    </div>
  );
}
