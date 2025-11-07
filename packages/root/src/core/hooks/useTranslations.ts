import {I18nContext, useI18nContext} from './useI18nContext.js';
import {useStringParams} from './useStringParams.js';
import {useTranslationMiddleware} from './useTranslationsMiddleware.js';

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
  const middleware = useTranslationMiddleware();

  function t(str: string, params?: Record<string, string | number>): string;
  function t(
    str: string | null | undefined,
    params?: Record<string, string | number>
  ): string | undefined {
    // Suppress verbatim `'undefined'` and `'null'` output, which can occur when
    // using `useTranslations` with undefined values.
    if (typeof str === 'undefined' || str === null) {
      // Return `undefined` to suppress empty props, e.g.
      // <a title={t(undefined)}>Learn more</a>
      return undefined;
    }
    let input = normalizeString(str);
    middleware.beforeTranslateFns.forEach((fn) => {
      input = fn(input);
    });
    let translation = translations[input] ?? input ?? '';
    middleware.afterTranslateFns.forEach((fn) => {
      translation = fn(translation);
    });

    // Replace string params, e.g. "Hello, {name}".
    middleware.beforeReplaceParamsFns.forEach((fn) => {
      translation = fn(translation);
    });
    if (testHasStringParams(translation)) {
      translation = replaceStringParams(translation, {
        ...stringParams,
        ...params,
      });
    }
    middleware.afterReplaceParamsFns.forEach((fn) => {
      translation = fn(translation);
    });

    return translation;
  }
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

function testHasStringParams(str: string) {
  return str.includes('{') && str.includes('}');
}

/**
 * Replaces string placeholder params, e.g.
 *
 * ```
 * replaceStringParams('Hello, {name}!', {name: 'Joe'})
 * // => 'Hello, Joe!'
 * ```
 */
function replaceStringParams(
  str: string,
  params: Record<string, string | number>
): string {
  return str.replace(/{([^}]+)}/g, (match, key) => {
    if (key in params) {
      return String(params[key]);
    }
    return match;
  });
}
