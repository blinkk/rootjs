import type {BatchRequest, RouteContext} from '@blinkk/root-cms';
import {BlogPostsDoc, GuidesDoc} from '@/root-cms.js';
import {sortBlogPosts} from '@/utils/blog.js';
import {sortGuides} from '@/utils/guides.js';
import {hasModule} from '@/utils/modules.js';

/**
 * A `createRoute()` batch request hook that queries the docs listed by the
 * page modules, i.e. the guides for `TemplateGuides` and the blog posts for
 * `TemplateBlogPosts`, so their translations are loaded with the page's.
 *
 * The doc isn't loaded yet when the batch request is built, so the docs are
 * queried for every page (published reads are cached in memory, see
 * `CMS_ROUTE_OPTIONS`).
 */
export function addModuleDataQueries(batchRequest: BatchRequest) {
  batchRequest.addQuery('guides', 'Guides');
  batchRequest.addQuery('blogPosts', 'BlogPosts');
}

/**
 * A `createRoute()` pre-render hook that adds the docs queried by
 * `addModuleDataQueries()` to the page props, as `guides` (sorted in the CMS
 * custom order) and `blogPosts` (newest first), when the doc has a module that
 * lists them.
 */
export function addModuleData(
  props: {doc?: {fields?: {content?: unknown}}},
  context: RouteContext
) {
  const content = props.doc?.fields?.content;
  const queries = context.batchResponse?.queries || {};
  const result: Record<string, unknown> = {...props};
  if (hasModule(content, 'TemplateGuides')) {
    result.guides = sortGuides(
      (queries.guides || []) as unknown as GuidesDoc[]
    );
  }
  if (hasModule(content, 'TemplateBlogPosts')) {
    result.blogPosts = sortBlogPosts(
      (queries.blogPosts || []) as unknown as BlogPostsDoc[]
    );
  }
  return result;
}
