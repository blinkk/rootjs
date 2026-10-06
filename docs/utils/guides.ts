import {GuidesDoc} from '@/root-cms.js';
import {sortByCustomOrder} from '@/utils/custom-order.js';

/** Returns the URL path for a guide, e.g. `/guides/publishing/`. */
export function getGuideUrl(doc: GuidesDoc) {
  // Nested slugs are stored with `--` in place of `/`.
  const slug = doc.slug.replaceAll('--', '/');
  return `/guides/${slug}/`;
}

/**
 * Sorts guides in the order set in the CMS by dragging docs in the collection's
 * "Custom order" view.
 */
export function sortGuides(guides: GuidesDoc[]) {
  return sortByCustomOrder(guides);
}
