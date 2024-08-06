/**
 * Converts a locale (e.g. `fr_CA`) to an ISO-639 href language code (e.g.
 * `fr-CA`). This can be used tags like `<html lang="">` and
 * `<link rel="alternate" hreflang="">`.
 *
 * https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
 */
export function toHrefLang(locale: string): string {
  if (locale === 'es_419') {
    return 'es-419';
  }
  if (locale.startsWith('ALL_')) {
    // Convert `ALL_xx` to `en-xx`. It is currently presumed that whenever
    // `ALL_xx` is used, the content may be untranslated but shows
    // country-specific information.
    const regionCode = locale.split('_')[1];
    if (regionCode === 'uk') {
      return 'en-GB';
    }
    return `en-${regionCode.toUpperCase()}`;
  }
  let hrefLang = locale.replace('_ALL', '').replace('_', '-');
  if (hrefLang.includes('-')) {
    // Capitalize the countryCode, e.g. `en-US`.
    const [langCode, countryCode] = hrefLang.split('-');
    hrefLang = `${langCode}-${countryCode.toUpperCase()}`;
  }
  return hrefLang;
}
