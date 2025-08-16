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
  fn: (key: string) => string | null | undefined
): string {
  return template.replace(/\{(.+?)\}/g, (match: string, key: string) => {
    const val = fn(key);
    if (val === undefined || val === null) {
      return match;
    }
    return val;
  });
}

export function getPlaceholderKeys(template: string): string[] {
  return Array.from(template.matchAll(/\{(.+?)\}/g)).map((match) => match[1]);
}
