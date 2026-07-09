/**
 * Utilities for resolving the locale fallback chain used by translations.
 *
 * The `i18n.fallbacks` config in root.config.ts maps a locale to an ordered
 * list of fallback locales. When a translation is missing for a locale, each
 * fallback locale is checked (in order) before falling back to
 * `i18n.defaultLocale` and finally the source string. For example:
 *
 * ```ts
 * i18n: {
 *   locales: ['en', 'en-GB', 'en-CA'],
 *   fallbacks: {
 *     'en-CA': ['en-GB'],
 *   },
 * }
 * ```
 *
 * With the config above, `resolveLocaleFallbacks(i18n, 'en-CA')` returns
 * `['en-CA', 'en-GB', 'en']`. Fallbacks are resolved recursively (breadth
 * first), and all matching is case-insensitive.
 */

export interface LocaleFallbacksI18nConfig {
  locales?: string[];
  defaultLocale?: string;
  fallbacks?: Record<string, string[]>;
}

/**
 * Resolves the ordered locale fallback chain for a locale, starting with the
 * locale itself and ending with the default locale. Fallback chains are
 * followed recursively (breadth first) with cycle protection, and locale keys
 * are matched case-insensitively while preserving the configured casing of
 * each fallback value.
 */
export function resolveLocaleFallbacks(
  i18nConfig: LocaleFallbacksI18nConfig | undefined,
  locale: string
): string[] {
  const fallbacks = i18nConfig?.fallbacks || {};
  // Normalize the fallback keys for case-insensitive lookups.
  const fallbacksByLowerKey: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(fallbacks)) {
    fallbacksByLowerKey[key.toLowerCase()] = values || [];
  }

  const chain: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [locale];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const lower = String(current).toLowerCase();
    if (visited.has(lower)) {
      continue;
    }
    visited.add(lower);
    chain.push(current);
    for (const fallback of fallbacksByLowerKey[lower] || []) {
      if (!visited.has(String(fallback).toLowerCase())) {
        queue.push(fallback);
      }
    }
  }

  // Always fall back to the default locale last.
  const defaultLocale = i18nConfig?.defaultLocale || 'en';
  if (!visited.has(defaultLocale.toLowerCase())) {
    chain.push(defaultLocale);
  }
  return chain;
}
