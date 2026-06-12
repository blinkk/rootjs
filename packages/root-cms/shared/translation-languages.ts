/**
 * Utilities for converting between a "root locale" and a "translation
 * language".
 *
 * Translation systems often use different language identifiers than root
 * locales, and multiple root locales may share the same translations. The
 * `i18n.translationLanguages` config in root.config.ts maps a root locale to
 * the language identifier used wherever translations are imported, exported,
 * or edited (CSV, Google Sheets, translation services, and the CMS
 * translations pages). For example:
 *
 * ```ts
 * i18n: {
 *   locales: ['en', 'es-419_mx', 'es-419_co'],
 *   translationLanguages: {
 *     'es-419_mx': 'es-419',
 *     'es-419_co': 'es-419',
 *   },
 * }
 * ```
 *
 * Locales not listed in the mapping use the locale id as the translation
 * language. All matching is case-insensitive.
 */

export interface TranslationLanguagesI18nConfig {
  locales?: string[];
  translationLanguages?: Record<string, string>;
}

/**
 * Returns the translation language for a root locale, e.g. `es-419` for the
 * `es-419_mx` locale. Returns the locale itself if no mapping is configured.
 */
export function getTranslationLanguage(
  i18nConfig: TranslationLanguagesI18nConfig,
  locale: string
): string {
  const mapping = i18nConfig.translationLanguages || {};
  const localeLower = String(locale).toLowerCase();
  for (const [key, lang] of Object.entries(mapping)) {
    if (key.toLowerCase() === localeLower) {
      return lang;
    }
  }
  return locale;
}

/**
 * Converts a list of root locales to translation languages, removing
 * duplicates (multiple root locales may share a translation language) while
 * preserving order.
 */
export function toTranslationLanguages(
  i18nConfig: TranslationLanguagesI18nConfig,
  locales: string[]
): string[] {
  const languages: string[] = [];
  for (const locale of locales) {
    const lang = getTranslationLanguage(i18nConfig, locale);
    if (!languages.includes(lang)) {
      languages.push(lang);
    }
  }
  return languages;
}

/**
 * Expands a translation language (or root locale) to the root locales it
 * covers. A value matches a root locale directly or via its configured
 * translation language, e.g. `es-419` returns both `es-419_mx` and
 * `es-419_co` with the example config above. Returns an empty array if the
 * value doesn't match any configured locale.
 */
export function getLocalesForTranslationLanguage(
  i18nConfig: TranslationLanguagesI18nConfig,
  lang: string
): string[] {
  const i18nLocales = i18nConfig.locales || ['en'];
  const langLower = String(lang).toLowerCase();
  const locales: string[] = [];
  for (const locale of i18nLocales) {
    if (
      String(locale).toLowerCase() === langLower ||
      getTranslationLanguage(i18nConfig, locale).toLowerCase() === langLower
    ) {
      locales.push(locale);
    }
  }
  return locales;
}

/**
 * Reads the translation for a translation language (or root locale) from a
 * map keyed by root locale, checking all root locales that share the
 * language and returning the first non-empty value.
 */
export function getTranslationForLanguage(
  i18nConfig: TranslationLanguagesI18nConfig,
  translations: Record<string, unknown>,
  lang: string
): string {
  for (const locale of getLocalesForTranslationLanguage(i18nConfig, lang)) {
    const value = translations[locale];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return '';
}
