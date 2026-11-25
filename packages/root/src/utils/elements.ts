export const ELEMENT_RE = /^[a-z][\w-]*-[\w-]*$/;
export const HTML_ELEMENTS_REGEX = /<([a-z][\w-]*-[\w-]*)/g;

/**
 * Returns true if the tagName is a valid custom element tag.
 */
export function isValidTagName(tagName: string) {
  return ELEMENT_RE.test(tagName);
}

/**
 * Returns a list of custom elements used in a src string (e.g. HTML, jsx, lit).
 * NOTE: the impl uses a simple regex, so tagNames used in comments and attr
 * values may be included.
 */
export function parseTagNames(src: string): string[] {
  if (!src) {
    return [];
  }
  const str = typeof src === 'string' ? src : String(src);
  if (!str.includes('-')) {
    return [];
  }
  const tagNames = new Set<string>();
  for (const match of str.matchAll(HTML_ELEMENTS_REGEX)) {
    tagNames.add(match[1]);
  }
  return Array.from(tagNames);
}
