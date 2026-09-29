import type {RootCMSClient} from '@blinkk/root-cms/client';
import {fetchBlogPostsForModules} from '@/utils/blog.js';
import {fetchGuidesForModules} from '@/utils/guides.js';

/**
 * A `cmsRoute()` pre-render hook that fetches the data needed by the doc's
 * modules, e.g. the guides for `TemplateGuides` and the blog posts for
 * `TemplateBlogPosts`.
 */
export async function fetchModuleData(
  props: {doc?: {fields?: {content?: unknown}}; $translationTags?: string[]},
  context: {cmsClient: RootCMSClient; mode: 'draft' | 'published'}
) {
  const withGuides = await fetchGuidesForModules(props, context);
  return fetchBlogPostsForModules(withGuides, context);
}
