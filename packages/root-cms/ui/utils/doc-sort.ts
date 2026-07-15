import {compareSortKeys} from '../../shared/sort-key.js';

interface SortableDoc {
  slug: string;
  sys?: {
    sortKey?: string;
    createdAt?: {toMillis?: () => number};
  };
}

/**
 * Sorts docs into their custom order (see the `customSorting` collection
 * option). Returns a new array.
 *
 * Docs with a `sys.sortKey` come first, ordered by key (ascending) with the
 * slug as a tiebreaker — this matches firestore's `orderBy('sys.sortKey')`
 * behavior (which breaks ties by document name), so the CMS list matches the
 * order returned by `listDocs()`. Docs without a sort key are listed last
 * (newest first) so they never silently disappear from the CMS; the
 * collection page shows a banner for assigning them a position.
 */
export function sortDocsCustomOrder<T extends SortableDoc>(docs: T[]): T[] {
  const keyed: T[] = [];
  const keyless: T[] = [];
  docs.forEach((doc) => {
    if (doc.sys?.sortKey) {
      keyed.push(doc);
    } else {
      keyless.push(doc);
    }
  });
  keyed.sort((a, b) => {
    const cmp = compareSortKeys(a.sys!.sortKey!, b.sys!.sortKey!);
    if (cmp !== 0) {
      return cmp;
    }
    return compareSlugs(a.slug, b.slug);
  });
  keyless.sort((a, b) => {
    const cmp = getCreatedAt(b) - getCreatedAt(a);
    if (cmp !== 0) {
      return cmp;
    }
    return compareSlugs(a.slug, b.slug);
  });
  return [...keyed, ...keyless];
}

function getCreatedAt(doc: SortableDoc): number {
  return doc.sys?.createdAt?.toMillis?.() ?? 0;
}

function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
