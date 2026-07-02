import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

// A click-to-edit tag picker shared by the Phrase and Vocab rows: toggleable
// suggestion chips plus a free-text "add tag" field. Assigning is immediate;
// removing an already-assigned tag asks for confirmation. The caller owns the
// tag list and receives the full next list via `onChange`.
type TagModalProps = {
  visible: boolean;
  title: string; // header (e.g. "Tags")
  subtitle: string; // the term / phrase being tagged
  addLabel: string; // label on the "add tag" chip
  tags: string[]; // currently assigned tags
  suggestions: string[]; // recently used tags to offer as chips
  onChange: (tags: string[]) => void;
  onClose: () => void;
};

export function TagModal({
  visible,
  title,
  subtitle,
  addLabel,
  tags,
  suggestions,
  onChange,
  onClose,
}: TagModalProps) {
  const t = useT();
  const [showInput, setShowInput] = useState(false);
  const [draft, setDraft] = useState('');

  function toggleTag(tag: string) {
    const has = tags.some((tg) => tg.toLowerCase() === tag.toLowerCase());
    if (has) {
      // Confirm before removing an already-assigned tag.
      if (window.confirm(t('tagModal.removeMsg', { tag }))) {
        onChange(tags.filter((tg) => tg.toLowerCase() !== tag.toLowerCase()));
      }
    } else {
      onChange([...tags, tag]);
    }
  }

  function addTag() {
    const v = draft.trim();
    setDraft('');
    setShowInput(false);
    if (!v || tags.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...tags, v]);
  }

  function closeModal() {
    addTag(); // commit any pending draft
    onClose();
  }

  if (!visible) return null;

  // Show assigned tags first, then any suggestions not already assigned.
  const chipTags = [...tags];
  for (const s of suggestions) {
    if (!chipTags.some((tg) => tg.toLowerCase() === s.toLowerCase())) chipTags.push(s);
  }

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-sub">{subtitle}</p>

        <div className="tagrow">
          {chipTags.map((tag) => {
            const on = tags.some((tg) => tg.toLowerCase() === tag.toLowerCase());
            return (
              <button
                key={tag}
                className={`tag${on ? ' on' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {on && <Check size={12} />}
                {tag}
              </button>
            );
          })}
          {showInput ? (
            <input
              className="tag-input"
              autoFocus
              placeholder={t('tagModal.newTag')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              onBlur={addTag}
            />
          ) : (
            <button className="tag add" onClick={() => setShowInput(true)}>
              <Plus size={13} />
              {addLabel}
            </button>
          )}
        </div>

        <button className="modal-close" onClick={closeModal}>
          {t('tagModal.close')}
        </button>
      </div>
    </div>
  );
}

// Read-only row of tag badges shown beneath a phrase / vocab entry.
export function TagBadges({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="tag-badges">
      {tags.map((tag) => (
        <span key={tag} className="tag-badge">
          {tag}
        </span>
      ))}
    </div>
  );
}
