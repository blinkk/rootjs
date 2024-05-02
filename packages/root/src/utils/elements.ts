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
  const tagNames = new Set<string>();
  const matches = Array.from(String(src).matchAll(HTML_ELEMENTS_REGEX));
  for (const match of matches) {
    const tagName = match[1];
    tagNames.add(tagName);
  }
  return Array.from(tagNames);
}
