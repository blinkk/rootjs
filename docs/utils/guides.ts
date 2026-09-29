import type {RootCMSClient} from '@blinkk/root-cms/client';
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
