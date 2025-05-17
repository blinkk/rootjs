export function isSlugValid(
  slug: string,
  pattern: string | RegExp = /^[a-z0-9]+(?:--?[a-z0-9]+)*$/
): boolean {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  return Boolean(slug && regex.test(slug));
}

/**
 * Normalizes a user-entered slug value into one appropriate for the CMS.
 *
 * In order to keep the slugs "flat" within firestore, nested paths use a double
 * dash separator. For example, a URL like "/about/foo" should have a slug like
 * "about--foo".
 *
 * Transformations include:
 *   Remove leading and trailing space
 *   Remove leading and trailing slash
 *   Lower case
 *   Replace '/' with '--', e.g. 'foo/bar' -> 'foo--bar'
 */
export function normalizeSlug(slug: string): string {
  return slug
    .replace(/^[\s/]*/g, '')
    .replace(/[\s/]*$/g, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replaceAll('/', '--');
}
