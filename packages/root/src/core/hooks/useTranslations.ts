import {I18nContext, useI18nContext} from './useI18nContext.js';
import {useStringParams} from './useStringParams.js';
import {useTransformationContext} from './useTransformationContext.js';

/**
 * A hook that returns a function for translating strings and performing
 * parameter substitution.
 *
 * The translation process can be customized by providing `preTranslation` and
 * `postTranslation` functions through the `TransformationContext`.
 *
 * - `preTranslation`: Applied to the string *before* it's looked up in the
 *   translation files. Useful for string normalization or transformations
 *   based on the original string and locale.
 * - `postTranslation`: Applied to the string *after* translation and parameter
 *   substitution. Useful for adjustments based on the translated string,
 *   parameters, and locale.
 *
 * If no `TransformationContext` is found, or if transformation functions are
 * not provided, the original string is used as-is for these steps.
 *
 * @example
 * ```tsx
 * // Basic usage:
 * const t = useTranslations();
 * t('Hello {name}', {name: 'Bob'}); // => 'Bonjour Bob' (if 'fr' locale)
 *
 * // With TransformationProvider for custom transformations:
 * import {TransformationProvider} from '../components/TransformationProvider';
 *
 * const App = () => (
 *   <TransformationProvider
 *     preTranslation={(str, locale) => {
 *       if (locale === 'en-US' && str === 'color') return 'colour';
 *       return str;
 *     }}
 *     postTranslation={(translatedStr, params, locale) => {
 *       // Example: Ensure product names are non-breaking
 *       if (params?.productName) {
 *         return translatedStr.replace(
 *           String(params.productName),
 *           String(params.productName).replace(/ /g, '&nbsp;')
 *         );
 *       }
 *       return translatedStr;
 *     }}
 *   >
 *     <MyComponent />
 *   </TransformationProvider>
 * );
 *
 * const MyComponent = () => {
 *   const t = useTranslations();
 *   // Assuming 'en-US' locale and 'color' is in translations as 'Color':
 *   // preTranslation changes 'color' to 'colour'.
 *   // 'colour' is looked up, let's say it's 'Colour'.
 *   // postTranslation might further adjust it.
 *   console.log(t('color')); // Might output 'Colour'
 *
 *   // Example with postTranslation for non-breaking spaces:
 *   console.log(t('Buy {productName} now!', {productName: 'Super Gadget'}));
 *   // Might output 'Buy Super&nbsp;Gadget now!'
 *   return <p>{t('Welcome')}</p>;
 * }
 * ```
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
  const stringParams = useStringParams();
  const {preTranslation, postTranslation} = useTransformationContext();
  const locale = i18nContext?.locale || 'en';

  const t = (str: string, params?: Record<string, string | number>) => {
    const transformedStr = preTranslation(str, locale);
    const key = normalizeString(transformedStr);
    let translation = translations[key] ?? key ?? '';
    const allParams = {...stringParams, ...params};
    for (const paramName of Object.keys(allParams)) {
      const paramValue = String(allParams[paramName] ?? '');
      translation = translation.replaceAll(`{${paramName}}`, paramValue);
    }
    translation = postTranslation(translation, params, locale);
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
    .map((line) => removeTrailingWhitespace(line));
  return lines.join('\n');
}

function removeTrailingWhitespace(str: string) {
  return String(str)
    .trimEnd()
    .replace(/&nbsp;$/, '');
}
