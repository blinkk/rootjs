/**
 * Utility functions for handling requests that mimic the Firebase Hosting i18n
 * fallback logic.
 * https://firebase.google.com/docs/hosting/i18n-rewrites
 */

import {Request} from '../core/types';
import {parseAcceptLanguage} from './accept-language';

export const UNKNOWN_COUNTRY = 'zz';
export const ES_419_COUNTRIES = [
  'ar', // Argentina
  'bo', // Bolivia
  'cl', // Chile
  'co', // Colombia
  'cr', // Costa Rica
  'cu', // Cuba
  'do', // Dominican Republic
  'ec', // Ecuador
  'sv', // El Salvador
  'gt', // Guatemala
  'hn', // Honduras
  'mx', // Mexico
  'ni', // Nicaragua
  'pa', // Panama
  'py', // Paraguay
  'pe', // Peru
  'pr', // Puerto Rico
  'uy', // Uruguay
  've', // Venezuela
];

export function getFallbackLocales(req: Request): string[] {
  const hl = getFirstQueryParam(req, 'hl');
  const countryCode = getCountry(req);

  // Web crawlers should only use the default locale.
  if (isWebCrawler(req)) {
    const defaultLocale = req.rootConfig?.i18n?.defaultLocale || 'en';
    if (hl && hl !== defaultLocale) {
      return [hl, defaultLocale];
    }
    return [defaultLocale];
  }

  const locales = new Set<string>();

  // Add locales from ?hl= query parameter.
  if (hl) {
    const langCode = hl;
    locales.add(`${langCode}_${countryCode}`);
    locales.add(`${langCode}_ALL`);
    locales.add(langCode);
  }

  const langs = getFallbackLanguages(req);

  // Add `{lang}_{country}` locales.
  langs.forEach((langCode) => {
    locales.add(`${langCode}_${countryCode}`);
  });

  // Add ALL_{country} locale.
  locales.add(`ALL_${countryCode}`);

  // Add `{lang}_ALL` and `{lang}` locales.
  const isEs419Country = test419Country(countryCode);
  langs.forEach((langCode) => {
    // For Spanish-speaking LATAM countries, also add es-419.
    if (langCode === 'es' && isEs419Country) {
      locales.add('es-419_ALL');
      locales.add('es-419');
    }
    locales.add(`${langCode}_ALL`);
    locales.add(langCode);
  });

  return Array.from(locales) as string[];
}

export function getCountry(req: Request) {
  const normalize = (countryCode: string) => String(countryCode).toLowerCase();
  // Check the ?gl= query param.
  const gl = getFirstQueryParam(req, 'gl');
  if (gl) {
    return normalize(gl);
  }
  const gaeCountry =
    req.get('x-country-code') || req.get('x-appengine-country');
  if (gaeCountry) {
    return normalize(gaeCountry);
  }
  return UNKNOWN_COUNTRY;
}

function getFallbackLanguages(req: Request): string[] {
  const langs = new Set<string>();
  // Add languages from the Accept-Language header.
  const acceptLangHeader = req.get('accept-language') || '';
  if (acceptLangHeader) {
    parseAcceptLanguage(acceptLangHeader).forEach((lang) => {
      // For a lang like `en-US`, add both `en-US` and `en`.
      if (lang.region) {
        langs.add(`${lang.code}-${lang.region}`);
        // For Spanish-speaking LATAM countries, also add es-419.
        if (lang.code === 'es' && test419Country(lang.region)) {
          langs.add('es-419');
        }
      }
      langs.add(lang.code);
    });
  }
  // Fall back to "en" as a last resort.
  langs.add('en');
  return Array.from(langs);
}

/**
 * Returns the first query param value in a given request.
 *
 * For example, for a URL like `/?foo=bar&foo=baz`, calling
 * `getFirstQueryParam(req, 'foo')` would return `"bar"`.
 */
function getFirstQueryParam(req: Request, key: string): string | null {
  const val = req.query[key];
  if (val === null || val === undefined) {
    return null;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) {
      return null;
    }
    return String(val[0]);
  }
  return String(val);
}

function isWebCrawler(req: Request): boolean {
  const userAgentHeader = req.get('User-Agent');
  if (!userAgentHeader) {
    return false;
  }
  const userAgent = userAgentHeader.toLowerCase();
  return (
    userAgent.includes('googlebot') ||
    userAgent.includes('bingbot') ||
    userAgent.includes('twitterbot')
  );
}

export function test419Country(countryCode: string) {
  return ES_419_COUNTRIES.includes(countryCode);
}
