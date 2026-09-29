import type {RootCMSClient} from '@blinkk/root-cms/client';
import {BlogPostsDoc} from '@/root-cms.js';
import {hasModule} from '@/utils/modules.js';

/** Returns the URL path for a blog post, e.g. `/blog/hello-world/`. */
export function getBlogPostUrl(doc: BlogPostsDoc) {
  const slug = doc.slug
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `/blog/${slug}/`;
}

/** Returns the time a blog post was first published, in millis. */
export function getBlogPostTime(doc: BlogPostsDoc) {
  return (
    doc.sys.firstPublishedAt || doc.sys.publishedAt || doc.sys.createdAt || 0
  );
}

/** Sorts blog posts newest first. */
export function sortBlogPosts(posts: BlogPostsDoc[]) {
  return [...posts].sort((a, b) => getBlogPostTime(b) - getBlogPostTime(a));
}

/**
 * Formats a blog post's publish date, e.g. `{iso: '2026-09-29', label:
 * 'September 29, 2026'}`, in Pacific time.
 */
export function formatBlogPostDate(doc: BlogPostsDoc) {
  const date = new Date(getBlogPostTime(doc));
  const timeZone = 'America/Los_Angeles';
  // The `en-CA` locale formats dates as `YYYY-MM-DD`.
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
  return {iso, label};
}

/**
 * A `cmsRoute()` pre-render hook that, when the doc has a `TemplateBlogPosts`
 * module, adds the blog posts (newest first) to the page props (as
 * `blogPosts`) and requests the translations for their copy.
 */
export async function fetchBlogPostsForModules(
  props: {doc?: {fields?: {content?: unknown}}; $translationTags?: string[]},
  context: {cmsClient: RootCMSClient; mode: 'draft' | 'published'}
) {
  if (!hasModule(props.doc?.fields?.content, 'TemplateBlogPosts')) {
    return props;
  }
  const res = await context.cmsClient.listDocs<BlogPostsDoc>('BlogPosts', {
    mode: context.mode,
  });
  const blogPosts = sortBlogPosts(res.docs);
  return {
    ...props,
    blogPosts,
    $translationTags: [
      ...(props.$translationTags || []),
      ...blogPosts.map((post) => `BlogPosts/${post.slug}`),
    ],
  };
}
