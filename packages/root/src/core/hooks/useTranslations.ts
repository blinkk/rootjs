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
  } catch {
    console.warn('I18nContext not found');
  }
  const translations = i18nContext?.translations || {};
  const stringParams = useStringParams();
  const hasStringParams = Object.keys(stringParams).length > 0;
  const middleware = useTranslationMiddleware();
  const beforeTranslateFns = middleware.beforeTranslateFns;
  const afterTranslateFns = middleware.afterTranslateFns;
  const beforeReplaceParamsFns = middleware.beforeReplaceParamsFns;
  const afterReplaceParamsFns = middleware.afterReplaceParamsFns;

  function t(str: string, params?: Record<string, string | number>): string;
  function t(
    str: string | null | undefined,
    params?: Record<string, string | number>
  ): string | undefined {
    // Suppress verbatim `'undefined'` and `'null'` output, which can occur when
    // using `useTranslations` with undefined values.
    if (typeof str === 'undefined' || str === null) {
      // Return `undefined` to suppress empty props, e.g.
      // <a title={t(undefined)}>Learn more</a>.
      return undefined;
    }
    let input = normalizeString(str);
    for (let i = 0; i < beforeTranslateFns.length; i++) {
      input = beforeTranslateFns[i](input);
    }
    const mapped = Object.hasOwn(translations, input)
      ? translations[input]
      : undefined;
    let translation = mapped ?? input ?? '';
    for (let i = 0; i < afterTranslateFns.length; i++) {
      translation = afterTranslateFns[i](translation);
    }

    // Replace string params, e.g. "Hello, {name}".
    for (let i = 0; i < beforeReplaceParamsFns.length; i++) {
      translation = beforeReplaceParamsFns[i](translation);
    }
    if (testHasStringParams(translation)) {
      if (params && hasStringParams) {
        translation = replaceStringParams(translation, {
          ...stringParams,
          ...params,
        });
      } else if (params) {
        translation = replaceStringParams(translation, params);
      } else if (hasStringParams) {
        translation = replaceStringParams(translation, stringParams);
      }
    }
    for (let i = 0; i < afterReplaceParamsFns.length; i++) {
      translation = afterReplaceParamsFns[i](translation);
    }

    return translation;
  }
  return t;
}

/**
 * Cleans a string that's used for translations. Performs the following:
 * - Removes any leading/trailing whitespace.
 * - Removes spaces at the end of any line.
 */
export function normalizeString(str: string) {
  const value = typeof str === 'string' ? str : String(str);
  const len = value.length;
  if (len === 0) {
    return '';
  }

  // Fast path for clean single-line strings without leading/trailing whitespace
  // or a trailing `&nbsp;`.
  if (value.indexOf('\n') === -1) {
    const first = value.charCodeAt(0);
    const last = value.charCodeAt(len - 1);
    if (
      isNonWhitespaceCharCode(first) &&
      isNonWhitespaceCharCode(last) &&
      (last !== 59 || !value.endsWith('&nbsp;'))
    ) {
      return value;
    }
    return stripTrailingNbsp(value.trim());
  }

  const trimmed = value.trim();
  if (trimmed.length !== len && trimmed.indexOf('\n') === -1) {
    return stripTrailingNbsp(trimmed);
  }
  const lines = trimmed.split('\n');
  for (let i = 0; i < lines.length; i++) {
    lines[i] = stripTrailingNbsp(lines[i].trimEnd());
  }
  return lines.join('\n');
}

function stripTrailingNbsp(str: string): string {
  return str.length >= 6 &&
    str.charCodeAt(str.length - 1) === 59 &&
    str.endsWith('&nbsp;')
    ? str.slice(0, -6)
    : str;
}

function isNonWhitespaceCharCode(code: number): boolean {
  if (code > 32 && code < 0x00a0) {
    return true;
  }
  if (code <= 32) {
    return false;
  }
  return !(
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
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
    if (Object.hasOwn(params, key)) {
      return String(params[key]);
    }
    return match;
  });
}
