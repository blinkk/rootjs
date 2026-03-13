const DEFAULT_SLUG_PATTERN = /^[a-z0-9_]+(?:--?[a-z0-9_]+)*$/;

export function isSlugValid(slug: string, pattern?: string | RegExp): boolean {
  if (!pattern) {
    pattern = DEFAULT_SLUG_PATTERN;
  }
  const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  return Boolean(slug && re.test(slug));
}

/**
 * Returns a human-readable error message explaining why a slug is invalid, or
 * an empty string if the slug is valid.
 */
export function getSlugError(slug: string, pattern?: string | RegExp): string {
  if (!slug) {
    return 'Slug cannot be empty.';
  }
  // When a custom pattern is provided, give a generic message since we can't
  // infer which specific rule was violated.
  if (pattern) {
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    if (!re.test(slug)) {
      return `Slug does not match required pattern: ${re.source}`;
    }
    return '';
  }
  if (/[A-Z]/.test(slug)) {
    return 'Slug must not contain uppercase letters.';
  }
  if (/[^a-z0-9_-]/.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, dashes, and underscores.';
  }
  if (slug.startsWith('-')) {
    return 'Slug must not start with a dash.';
  }
  if (slug.endsWith('-')) {
    return 'Slug must not end with a dash.';
  }
  if (!DEFAULT_SLUG_PATTERN.test(slug)) {
    return 'Invalid slug format. Use only lowercase letters, numbers, dashes, and underscores (e.g. "foo-bar-123").';
  }
  return '';
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
 *   Replace '/' with '--', e.g. 'foo/bar' -> 'foo--bar'
 */
export function normalizeSlug(slug: string): string {
  return slug
    .replace(/^[\s/]*/g, '')
    .replace(/[\s/]*$/g, '')
    .replace(/^\/+|\/+$/g, '')
    .replaceAll('/', '--');
}
