export function strFormat(
  template: string,
  placeholders: Record<string, string>
): string {
  const keys = getPlaceholderKeys(template);
  for (const key of keys) {
    if (placeholders[key]) {
      const val = String(placeholders[key]);
      template = template.replaceAll(`{${key}}`, val);
    }
  }
  return template;
}

/**
 * Replaces `{placeholder}` values in a template using a callback function.
 *
 * The callback is invoked for each placeholder key and should return the
 * replacement value. If the callback returns `undefined` or `null`, the
 * placeholder is left untouched.
 */
export function strFormatFn(
  template: string,
  fn: (key: string) => unknown
): string {
  const keys = getPlaceholderKeys(template);
  for (const key of keys) {
    const val = fn(key);
    if (val !== undefined && val !== null) {
      template = template.replaceAll(`{${key}}`, String(val));
    }
  }
  return template;
}

export function getPlaceholderKeys(template: string): string[] {
  return Array.from(template.matchAll(/\{(.+?)\}/g)).map((match) => match[1]);
}
