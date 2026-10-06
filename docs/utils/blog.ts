import {BlogPostsDoc} from '@/root-cms.js';

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
