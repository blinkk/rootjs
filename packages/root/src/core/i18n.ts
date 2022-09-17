import path from 'node:path';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const I18N_CONTEXT = createContext<I18nContext | null>(null);

export interface I18nContext {
  locale: string;
  translations: Record<string, string>;
}

export function getTranslations(locale: string): Record<string, string> {
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
  return translations[locale] || {};
}

export function useTranslations() {
  const context = useContext(I18N_CONTEXT);
  if (!context) {
    throw new Error('could not find i18n context');
  }
  const translations = context?.translations || {};
  const t = (str: string, params?: Record<string, string>) => {
    let translation = translations[str] || str || '';
    if (params) {
      for (const key of Object.keys(params)) {
        const val = String(params[key] || '');
        translation = translation.replaceAll(`{${key}}`, val);
      }
    }
    return translation;
  };
  return t;
}
