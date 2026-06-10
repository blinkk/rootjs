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

/**
 * Memoized map of locale -> translations, loaded from the project's
 * `/translations/*.json` files. Built once per process — `getTranslations()`
 * is called on every page render, and the underlying files cannot change at
 * runtime (in dev, module reloads reset the memo).
 */
let TRANSLATIONS: Record<string, Record<string, string>> | null = null;

function loadTranslationsMap(): Record<string, Record<string, string>> {
  const translations: Record<string, Record<string, string>> = {};
  const translationsFiles = import.meta.glob(['/translations/*.json'], {
    eager: true,
  }) as Record<string, {default?: Record<string, string>}>;
  Object.keys(translationsFiles).forEach((translationPath) => {
    const parts = path.parse(translationPath);
    const locale = parts.name;
    const module = translationsFiles[translationPath];
    if (module && module.default) {
      translations[locale] = module.default;
    }
  });
  return translations;
}

export function getTranslations(locale: string): Record<string, string> {
  if (!TRANSLATIONS) {
    TRANSLATIONS = loadTranslationsMap();
  }
  return TRANSLATIONS[locale] || {};
}
