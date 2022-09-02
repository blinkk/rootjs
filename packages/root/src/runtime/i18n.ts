import path from 'path';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const TRANSLATIONS_CONTEXT = createContext<Record<string, string>>({});

const TRANSLATIONS: Record<string, Record<string, string>> = {};
const TRANSLATIONS_FILES = import.meta.glob(['/translations/*.json'], {
  eager: true,
}) as Record<string, {default?: Record<string, string>}>;
Object.keys(TRANSLATIONS_FILES).forEach(translationPath => {
  const parts = path.parse(translationPath);
  const locale = parts.name;
  const module = TRANSLATIONS_FILES[translationPath];
  if (module && module.default) {
    TRANSLATIONS[locale] = module.default;
  }
});

export function t(str: string, params?: Record<string, string>) {
  const context = useContext(TRANSLATIONS_CONTEXT);
  let translation = context[str] || str;
  if (params) {
    for (const key in params) {
      const val = String(params[key] || '');
      translation = translation.replaceAll(`{${key}}`, val);
    }
  }
  return translation;
}

export function getTranslations(locale: string): Record<string, string> {
  return TRANSLATIONS[locale] || {};
}
