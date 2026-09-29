import type {RootCMSClient} from '@blinkk/root-cms/client';
import {GuidesDoc} from '@/root-cms.js';
import {sortByCustomOrder} from '@/utils/custom-order.js';
import {hasModule} from '@/utils/modules.js';

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

/**
 * A `cmsRoute()` pre-render hook that, when the doc has a `TemplateGuides`
 * module, adds the sorted guides to the page props (as `guides`) and requests
 * the translations for their card copy.
 */
export async function fetchGuidesForModules(
  props: {doc?: {fields?: {content?: unknown}}; $translationTags?: string[]},
  context: {cmsClient: RootCMSClient; mode: 'draft' | 'published'}
) {
  if (!hasModule(props.doc?.fields?.content, 'TemplateGuides')) {
    return props;
  }
  const res = await context.cmsClient.listDocs<GuidesDoc>('Guides', {
    mode: context.mode,
  });
  const guides = sortGuides(res.docs);
  return {
    ...props,
    guides,
    $translationTags: [
      ...(props.$translationTags || []),
      ...guides.map((guide) => `Guides/${guide.slug}`),
    ],
  };
}
