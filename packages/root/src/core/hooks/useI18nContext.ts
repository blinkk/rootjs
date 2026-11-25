import path from 'node:path';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const I18N_CONTEXT = createContext<I18nContext | null>(null);

export interface I18nContext {
  locale: string;
  translations: Record<string, string>;
}

/**
 * A hook that returns information about the current i18n context, including the
 * locale for the given route and a map of translations for that locale.
 */
export function useI18nContext() {
  const context = useContext(I18N_CONTEXT);
  if (!context) {
    throw new Error('I18N_CONTEXT not found');
  }
  return context;
}

let cachedTranslationsByLocale: Record<string, Record<string, string>> | null =
  null;

function getTranslationsByLocale(): Record<string, Record<string, string>> {
  if (cachedTranslationsByLocale) {
    return cachedTranslationsByLocale;
  }
  const translations: Record<string, Record<string, string>> = Object.create(
    null
  );
  const translationsFiles = import.meta.glob(['/translations/*.json'], {
    eager: true,
  }) as Record<string, {default?: Record<string, string>}>;
  for (const translationPath of Object.keys(translationsFiles)) {
    const parts = path.parse(translationPath);
    const module = translationsFiles[translationPath];
    if (module && module.default) {
      translations[parts.name] = module.default;
    }
  }
  cachedTranslationsByLocale = translations;
  return translations;
}

export function getTranslations(locale: string): Record<string, string> {
  return getTranslationsByLocale()[locale] || {};
}
