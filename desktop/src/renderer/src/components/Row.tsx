import type { ReactNode } from 'react';
import { GraduationCap, Trash2 } from 'lucide-react';

// Desktop replacement for the mobile SwipeRow. The card body is clickable
// (→ onTap, typically opens the tag editor); Learn/Delete appear as buttons in
// a hover-revealed strip on the right.
type Props = {
  children: ReactNode;
  onDelete?: () => void;
  onLearn?: () => void;
  onTap?: () => void;
  deleteLabel?: string;
  learnLabel?: string;
};

export function Row({ children, onDelete, onLearn, onTap, deleteLabel, learnLabel }: Props) {
  return (
    <div className="row-wrap">
      <div
        className={`card-row${onTap ? ' tappable' : ''}`}
        onClick={onTap}
        role={onTap ? 'button' : undefined}
      >
        {children}
      </div>
      <div className="row-hover-actions">
        {onLearn && (
          <button
            className="hover-action learn"
            title={learnLabel}
            aria-label={learnLabel}
            onClick={(e) => {
              e.stopPropagation();
              onLearn();
            }}
          >
            <GraduationCap size={16} />
          </button>
        )}
        {onDelete && (
          <button
            className="hover-action delete"
            title={deleteLabel}
            aria-label={deleteLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
