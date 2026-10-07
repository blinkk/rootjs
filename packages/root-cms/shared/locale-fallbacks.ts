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
  /**
   * Map of locale to fallback locales, or a function that returns the
   * fallback locales for a locale.
   */
  fallbacks?: Record<string, string[]> | ((locale: string) => string[]);
  /**
   * Falls back from a `<lang>_<country>` (or `<lang>-<country>`) locale to
   * `<lang>`, e.g. `ja_jp` -> `ja`, after any configured `fallbacks`. When
   * `locales` is set, only fallbacks to configured locales are added.
   */
  fallbackToLanguage?: boolean;
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
  const getFallbacks = createFallbacksFn(i18nConfig);
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
    for (const fallback of getFallbacks(current)) {
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

/**
 * Returns a function that returns the direct fallbacks of a locale.
 */
function createFallbacksFn(
  i18nConfig: LocaleFallbacksI18nConfig | undefined
): (locale: string) => string[] {
  const fallbacks = i18nConfig?.fallbacks;
  let getConfiguredFallbacks: (locale: string) => string[];
  if (typeof fallbacks === 'function') {
    getConfiguredFallbacks = (locale) => fallbacks(locale) || [];
  } else {
    // Normalize the fallback keys for case-insensitive lookups.
    const fallbacksByLowerKey: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(fallbacks || {})) {
      fallbacksByLowerKey[key.toLowerCase()] = values || [];
    }
    getConfiguredFallbacks = (locale) =>
      fallbacksByLowerKey[String(locale).toLowerCase()] || [];
  }
  if (!i18nConfig?.fallbackToLanguage) {
    return getConfiguredFallbacks;
  }

  // Map of lower-cased locale to the configured casing.
  const siteLocales = new Map<string, string>();
  for (const siteLocale of i18nConfig.locales || []) {
    siteLocales.set(siteLocale.toLowerCase(), siteLocale);
  }
  return (locale) => {
    const result = [...getConfiguredFallbacks(locale)];
    // Strip the last subtag until a configured locale is found, e.g.
    // `zh-Hant-TW` -> `zh-Hant` -> `zh`.
    let parent = String(locale);
    let match: RegExpMatchArray | null;
    while ((match = parent.match(/^(.+)[_-][^_-]+$/))) {
      parent = match[1];
      if (siteLocales.size === 0) {
        result.push(parent);
        break;
      }
      const siteLocale = siteLocales.get(parent.toLowerCase());
      if (siteLocale) {
        result.push(siteLocale);
        break;
      }
    }
    return result;
  };
}
