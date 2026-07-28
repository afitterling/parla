import { useMemo, useState } from 'react';

// Shared browsing controls for the Vocab and Phrase lists: a text search, a
// Latest/By-tag ordering, and a multi-select tag filter. Ported from the mobile
// app so both platforms (and both lists) behave identically.

export type Taggable = { id: string; tags: string[]; createdAt: number };

export type Ordering = 'latest' | 'tag';

export type TagSection<T> = { title: string; data: T[] };

// Filtering + grouping state and derived lists for a tagged collection.
// `toHaystack` returns the lowercased text a search query is matched against
// (the caller decides which fields count). `untaggedLabel` titles the catch-all
// group shown in By-tag mode when no tag filter is active.
export function useTaggedList<T extends Taggable>(
  items: T[],
  toHaystack: (item: T) => string,
  untaggedLabel: string
) {
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<Ordering>('latest');
  // Empty = no tag filter (show all). Otherwise an item matches if it carries
  // ANY selected tag (union) — topical tags rarely co-occur, so intersection
  // would usually show nothing.
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = filterTags.map((t) => t.toLowerCase());
    return items.filter((item) => {
      const matchSearch = !q || toHaystack(item).includes(q);
      const matchTag =
        active.length === 0 || item.tags.some((t) => active.includes(t.toLowerCase()));
      return matchSearch && matchTag;
    });
  }, [items, search, filterTags, toHaystack]);

  const latest = useMemo(
    () => [...filtered].sort((a, b) => b.createdAt - a.createdAt),
    [filtered]
  );

  const sections = useMemo<TagSection<T>[]>(() => {
    const tagSet = new Set<string>();
    filtered.forEach((item) => item.tags.forEach((t) => tagSet.add(t)));
    let tagList = [...tagSet].sort((a, b) => a.localeCompare(b));
    if (filterTags.length > 0) {
      const active = filterTags.map((t) => t.toLowerCase());
      tagList = tagList.filter((t) => active.includes(t.toLowerCase()));
    }
    const secs: TagSection<T>[] = tagList.map((tag) => ({
      title: tag,
      data: filtered
        .filter((item) => item.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
        .sort((a, b) => b.createdAt - a.createdAt),
    }));
    if (filterTags.length === 0) {
      const untagged = filtered
        .filter((item) => item.tags.length === 0)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (untagged.length) secs.push({ title: untaggedLabel, data: untagged });
    }
    return secs;
  }, [filtered, filterTags, untaggedLabel]);

  return {
    search,
    setSearch,
    ordering,
    setOrdering,
    filterTags,
    setFilterTags,
    filtered,
    latest,
    sections,
  };
}

// Search box + Latest/By-tag order toggle. Rendered above the tag filter.
export function ListControls({
  search,
  onSearch,
  ordering,
  onOrdering,
  placeholder,
  latestLabel,
  byTagLabel,
}: {
  search: string;
  onSearch: (v: string) => void;
  ordering: Ordering;
  onOrdering: (o: Ordering) => void;
  placeholder: string;
  latestLabel: string;
  byTagLabel: string;
}) {
  return (
    <div className="list-controls">
      <input
        className="list-search"
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="order-toggle">
        <button
          className={`order-btn${ordering === 'latest' ? ' active' : ''}`}
          onClick={() => onOrdering('latest')}
        >
          {latestLabel}
        </button>
        <button
          className={`order-btn${ordering === 'tag' ? ' active' : ''}`}
          onClick={() => onOrdering('tag')}
        >
          {byTagLabel}
        </button>
      </div>
    </div>
  );
}

// Multi-select tag filter: an "All" chip (active when nothing is selected, and
// clears the selection) followed by one chip per tag. Renders nothing when there
// are no tags to offer.
export function TagFilterRow({
  tags,
  value,
  onChange,
  allLabel,
}: {
  tags: string[];
  value: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
}) {
  if (tags.length === 0) return null;
  const isOn = (tag: string) => value.some((v) => v.toLowerCase() === tag.toLowerCase());
  function toggle(tag: string) {
    if (isOn(tag)) onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
    else onChange([...value, tag]);
  }
  return (
    <div className="filter-row">
      <button
        className={`filter-chip${value.length === 0 ? ' on' : ''}`}
        onClick={() => onChange([])}
      >
        {allLabel}
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          className={`filter-chip${isOn(tag) ? ' on' : ''}`}
          onClick={() => toggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
