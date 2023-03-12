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

export function getPlaceholderKeys(template: string): string[] {
  return Array.from(template.matchAll(/\{(.+?)\}/g)).map((match) => match[1]);
}
