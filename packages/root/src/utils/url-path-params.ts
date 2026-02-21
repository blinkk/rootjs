/**
 * Replaces route parameters in a URL path format string with actual values.
 *
 * Supported parameter formats:
 * - `[param]` - Required parameter, must be provided in params object.
 * - `[...param]` - Required catch-all parameter (matches multiple path segments).
 * - `[[...param]]` - Optional catch-all parameter, replaced with empty string if omitted.
 *
 * @param urlPathFormat - The URL path template containing parameter placeholders.
 * @param params - An object mapping parameter names to their replacement values.
 * @returns The URL path with all parameters replaced.
 * @throws Error if a required parameter is missing from the params object.
 *
 * @example
 * replaceParams('/products/[id]', { id: '123' });
 * // Returns: '/products/123'
 *
 * @example
 * replaceParams('/wiki/[[...slug]]', { slug: 'foo/bar' });
 * // Returns: '/wiki/foo/bar'
 *
 * @example
 * replaceParams('/wiki/[[...slug]]', {});
 * // Returns: '/wiki/'
 */
export function replaceParams(
  urlPathFormat: string,
  params: Record<string, string>
) {
  return urlPathFormat.replaceAll(
    /\[\[?(\.\.\.)?([a-zA-Z0-9_-]*)\]?\]/g,
    (match: string, _wildcard: string, key: string) => {
      const val = params[key];
      if (typeof val !== 'string') {
        // Optional catch-all params (e.g., [[...slug]]) can be omitted.
        if (match.startsWith('[[') && match.endsWith(']]')) {
          return '';
        }
        throw new Error(`unreplaced param ${match} in url: ${urlPathFormat}`);
      }
      return val;
    }
  );
}

export function testPathHasParams(urlPath: string) {
  const segments = urlPath.split('/');
  return segments.some((segment) => {
    return segment.startsWith('[') && segment.includes(']');
  });
}
