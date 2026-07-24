import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';
import { useStyles } from '../ThemeContext';

// Shared browsing controls for the Vocab and Phrase lists: a text search, a
// Latest/By-tag ordering, and a multi-select tag filter. The Phrase list grew
// this first; it now lives here so both screens behave identically.

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
        active.length === 0 ||
        item.tags.some((t) => active.includes(t.toLowerCase()));
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

// Multi-select tag filter: an "All" chip (active when nothing is selected, and
// clears the selection) followed by one chip per tag. Tapping a tag toggles its
// membership in `value`. Renders nothing when there are no tags to offer.
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
  const styles = useStyles(makeStyles);
  if (tags.length === 0) return null;
  const isOn = (tag: string) => value.some((v) => v.toLowerCase() === tag.toLowerCase());
  function toggle(tag: string) {
    if (isOn(tag)) onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
    else onChange([...value, tag]);
  }
  return (
    <View style={styles.filterRow}>
      <Pressable
        style={[styles.filterChip, value.length === 0 && styles.filterChipOn]}
        onPress={() => onChange([])}
      >
        <Text style={[styles.filterChipText, value.length === 0 && styles.filterChipTextOn]}>
          {allLabel}
        </Text>
      </Pressable>
      {tags.map((tag) => {
        const on = isOn(tag);
        return (
          <Pressable
            key={tag}
            style={[styles.filterChip, on && styles.filterChipOn]}
            onPress={() => toggle(tag)}
          >
            <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{tag}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    filterChip: {
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
      backgroundColor: theme.colors.bgElevated,
    },
    filterChipOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentDim },
    filterChipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
    filterChipTextOn: { color: theme.colors.text },
  });
}
