import {GuidesDoc} from '@/root-cms.js';

/** Returns the URL path for a guide, e.g. `/guides/publishing/`. */
export function getGuideUrl(doc: GuidesDoc) {
  // Nested slugs are stored with `--` in place of `/`.
  const slug = doc.slug.replaceAll('--', '/');
  return `/guides/${slug}/`;
}

/**
 * Sorts guides in the order set in the CMS (the collection uses
 * `customSorting`, which stores each doc's position at `sys.sortKey`). Guides
 * without a position, e.g. ones created by a script, go last, by title.
 */
export function sortGuides(guides: GuidesDoc[]) {
  return [...guides].sort((a, b) => {
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
