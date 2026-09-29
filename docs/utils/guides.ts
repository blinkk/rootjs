import {GuidesDoc} from '@/root-cms.js';

/** Returns the URL path for a guide, e.g. `/guides/publishing/`. */
export function getGuideUrl(doc: GuidesDoc) {
  // Nested slugs are stored with `--` in place of `/`.
  const slug = doc.slug.replaceAll('--', '/');
  return `/guides/${slug}/`;
}

/** Sorts guides by `meta.order`, then by title. */
export function sortGuides(guides: GuidesDoc[]) {
  return [...guides].sort((a, b) => {
    const orderA = a.fields?.meta?.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.fields?.meta?.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const titleA = a.fields?.meta?.title || a.slug;
    const titleB = b.fields?.meta?.title || b.slug;
    return titleA.localeCompare(titleB);
  });
}
