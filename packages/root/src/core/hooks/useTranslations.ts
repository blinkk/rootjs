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
  const t = (str: string, params?: Record<string, string>) => {
    let translation = translations[str] ?? str ?? '';
    if (params) {
      for (const key of Object.keys(params)) {
        const val = String(params[key] ?? '');
        translation = translation.replaceAll(`{${key}}`, val);
      }
    }
    return translation;
  };
  return t;
}
