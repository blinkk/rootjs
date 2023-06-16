import {useI18nContext} from './useI18nContext';

/**
 * A hook that returns a function that can be used to translate a string, and
 * optionally replace any parameterized values that are surrounded in curly
 * braces.
 *
 * Usage:
 *
 * ```ts
 * const t = useTranslations();
 * t('Hello {name}', {name: 'Bob'});
 * // => 'Bounjour Bob'
 */
export function useTranslations() {
  const context = useI18nContext();
  const translations = context.translations || {};
  const t = (str: string, params?: Record<string, string | number>) => {
    const key = normalizeString(str);
    let translation = translations[key] ?? key ?? '';
    if (params) {
      for (const param of Object.keys(params)) {
        const val = String(params[param] ?? '');
        translation = translation.replaceAll(`{${param}}`, val);
      }
    }
    return translation;
  };
  return t;
}

/**
 * Cleans a string that's used for translations. Performs the following:
 * - Removes any leading/trailing whitespace
 * - Removes spaces at the end of any line
 */
export function normalizeString(str: string) {
  const regex = /^(.*?)(\s+)?$/gm;
  return str.replace(regex, '$1').trim();
}
