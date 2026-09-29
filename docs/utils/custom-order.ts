/** A CMS doc from a collection that uses the `customSorting` option. */
export interface CustomOrderDoc {
  slug: string;
  sys?: {sortKey?: string};
  fields?: {meta?: {title?: string}};
}

/**
 * Sorts docs in the order set in the CMS (collections with `customSorting`
 * store each doc's position at `sys.sortKey`). Docs without a position, e.g.
 * ones created by a script, go last, by title.
 */
export function sortByCustomOrder<T extends CustomOrderDoc>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const keyA = a.sys?.sortKey;
    const keyB = b.sys?.sortKey;
    if (keyA && keyB && keyA !== keyB) {
      // Compare by code point, matching Firestore's string ordering (see
      // `compareSortKeys()` in `@blinkk/root-cms`).
      return keyA < keyB ? -1 : 1;
    }
    if (keyA && !keyB) {
      return -1;
    }
    if (!keyA && keyB) {
      return 1;
    }
    const titleA = a.fields?.meta?.title || a.slug;
    const titleB = b.fields?.meta?.title || b.slug;
    return titleA.localeCompare(titleB);
  });
}
