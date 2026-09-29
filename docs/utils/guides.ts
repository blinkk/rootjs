import type {RootCMSClient} from '@blinkk/root-cms/client';
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

/** Returns true if any module in `value`, at any depth, is `TemplateGuides`. */
function hasGuidesModule(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasGuidesModule);
  }
  if (value && typeof value === 'object') {
    if ((value as {_type?: string})._type === 'TemplateGuides') {
      return true;
    }
    return Object.values(value).some(hasGuidesModule);
  }
  return false;
}

/**
 * A `cmsRoute()` pre-render hook that, when the doc has a `TemplateGuides`
 * module, adds the sorted guides to the page props (as `guides`) and requests
 * the translations for their card copy.
 */
export async function fetchGuidesForModules(
  props: {doc?: {fields?: {content?: unknown}}},
  context: {cmsClient: RootCMSClient; mode: 'draft' | 'published'}
) {
  if (!hasGuidesModule(props.doc?.fields?.content)) {
    return props;
  }
  const res = await context.cmsClient.listDocs<GuidesDoc>('Guides', {
    mode: context.mode,
  });
  const guides = sortGuides(res.docs);
  return {
    ...props,
    guides,
    $translationTags: guides.map((guide) => `Guides/${guide.slug}`),
  };
}
