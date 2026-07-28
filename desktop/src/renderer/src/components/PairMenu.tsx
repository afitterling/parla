import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { LanguagePair } from '../storage';
import { findLanguage } from '../languages';
import { useT } from '../i18n/I18nContext';

// Quick switch between the language pairs the learner has already saved content
// into. Sits in the app header: the button shows the pair in use, clicking it
// drops down the recently used ones — one click sets input + goal together.
type Props = {
  input: string;
  goal: string;
  pairs: LanguagePair[];
  onPick: (input: string, goal: string) => void;
};

export function PairMenu({ input, goal, pairs, onPick }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // The pair in use always leads the list, even before anything was saved in it.
  const list: LanguagePair[] = [
    { input, goal, usedAt: 0 },
    ...pairs.filter((p) => !(p.input === input && p.goal === goal)),
  ];

  return (
    <div className="pair-wrap" ref={wrapRef}>
      <button className="pair-btn" onClick={() => setOpen((v) => !v)}>
        <span className="pair-flags">
          {findLanguage(input).flag}
          {findLanguage(goal).flag}
        </span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="pair-menu">
          <div className="pair-menu-title">{t('pairs.title')}</div>
          <div className="pair-list">
            {list.map((p) => {
              const active = p.input === input && p.goal === goal;
              const from = findLanguage(p.input);
              const to = findLanguage(p.goal);
              return (
                <button
                  key={`${p.input}>${p.goal}`}
                  className={`pair-row${active ? ' active' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    if (!active) onPick(p.input, p.goal);
                  }}
                >
                  <span className="pair-row-flags">
                    {from.flag} → {to.flag}
                  </span>
                  <span className="pair-row-text">
                    {from.nativeName} → {to.nativeName}
                  </span>
                  {active && <Check size={16} className="pair-row-check" />}
                </button>
              );
            })}
          </div>
          {list.length === 1 && <div className="pair-empty">{t('pairs.empty')}</div>}
        </div>
      )}
    </div>
  );
}
