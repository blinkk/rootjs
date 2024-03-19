import {I18nContext, useI18nContext} from './useI18nContext';

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
  // Ignore I18nContext not found error when used with client-side rehydration.
  let i18nContext: I18nContext | null = null;
  try {
    i18nContext = useI18nContext();
  } catch (err) {
    console.warn('I18nContext not found');
  }
  const translations = i18nContext?.translations || {};
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
  const lines = String(str)
    .trim()
    .split('\n')
    .map((line) => line.trimEnd());
  return lines.join('\n');
}
