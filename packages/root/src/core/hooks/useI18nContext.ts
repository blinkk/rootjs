import path from 'node:path';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
// @ts-ignore — virtual module provided by rootPodsVitePlugin
import {TRANSLATION_MODULES} from 'virtual:root/translations';

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

const translationModules = (TRANSLATION_MODULES || {}) as Record<
  string,
  {default?: Record<string, string>}
>;

export function getTranslations(locale: string): Record<string, string> {
  const translations: Record<string, Record<string, string>> = {};

  // Process pod translations first (lower priority).
  Object.keys(translationModules).forEach((translationPath) => {
    const module = translationModules[translationPath];
    if (!module?.default) return;

    const podMatch = translationPath.match(
      /\/translations\/pod:([^:]+):(.+)\.json$/
    );
    if (podMatch) {
      const podLocale = podMatch[2];
      translations[podLocale] = {
        ...translations[podLocale],
        ...module.default,
      };
      return;
    }

    const parts = path.parse(translationPath);
    const fileLocale = parts.name;
    translations[fileLocale] = {
      ...translations[fileLocale],
      ...module.default,
    };
  });

  return translations[locale] || {};
}
