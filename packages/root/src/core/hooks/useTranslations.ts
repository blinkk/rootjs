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
    const key = normalizeStr(str);
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

function normalizeStr(str: string) {
  return String(str).trim();
}
