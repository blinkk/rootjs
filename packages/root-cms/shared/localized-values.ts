/**
 * Utilities for resolving "localized field values", i.e. per-locale overrides
 * of a field's value.
 *
 * Localized values are stored in the field's `@<id>` metadata, next to the
 * field's default value:
 *
 * ```json
 * {
 *   "image": {"src": "hero.png"},
 *   "@image": {
 *     "localizedValues": {
 *       "de": {"src": "hero-de.png"},
 *       "en-GB": {"src": "hero-gb.png"}
 *     }
 *   }
 * }
 * ```
 *
 * A localized value replaces the field's entire value (there's no deep merge).
 * A `null` localized value is a valid override (e.g. to hide an image for a
 * locale). The default value is used when none of the locales in the fallback
 * chain have a localized value.
 */

import {isRichTextData} from './marshal.js';

export interface ResolveLocalizedValuesOptions {
  /**
   * Keeps the `localizedValues` in the `@<id>` metadata of the returned data.
   * By default they're removed, since they're no longer needed once resolved
   * and can be large (e.g. an image for every locale).
   */
  keepLocalizedValues?: boolean;
}

/**
 * Returns a copy of `data` with each field that has localized values replaced
 * by the localized value for the first matching locale in `locales`.
 *
 * `locales` is the locale fallback chain in order of precedence, e.g.
 * `["en-CA", "en-GB", "en"]`. A single locale is not expanded through any
 * fallbacks, use `resolveLocaleFallbacks()` to build the chain from the root
 * config. Locales are matched case-insensitively.
 *
 * The input is never mutated. Objects that don't contain any localized values
 * are returned as-is (not copied), so unchanged subtrees are shared between
 * the input and the output.
 *
 * ```ts
 * const locales = resolveLocaleFallbacks(rootConfig.i18n, 'en-CA');
 * const doc = resolveLocalizedValues(rawDoc, locales);
 * ```
 */
export function resolveLocalizedValues<T>(
  data: T,
  locales: string | string[],
  options?: ResolveLocalizedValuesOptions
): T {
  const chain = Array.isArray(locales) ? locales : [locales];
  return resolveNode(data, chain, options || {});
}

function resolveNode(
  node: any,
  locales: string[],
  options: ResolveLocalizedValuesOptions
): any {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    let out: any[] | null = null;
    for (let i = 0; i < node.length; i++) {
      const resolved = resolveNode(node[i], locales, options);
      if (resolved !== node[i]) {
        out ??= [...node];
        out[i] = resolved;
      }
    }
    return out || node;
  }
  // Rich text blocks never contain field metadata.
  if (isRichTextData(node)) {
    return node;
  }

  // Copy-on-write, so that docs without localized values aren't copied.
  let out: Record<string, any> | null = null;
  const set = (key: string, value: any) => {
    const copy: Record<string, any> = (out ??= {...node});
    if (value === undefined) {
      delete copy[key];
    } else {
      copy[key] = value;
    }
  };

  // Fields with a localized value for one of the locales. The localized value
  // is used even if the field has no default value.
  const overridden = new Set<string>();
  for (const key in node) {
    if (!key.startsWith('@')) {
      continue;
    }
    const metadata = node[key];
    const localizedValues = metadata?.localizedValues;
    if (!isPlainObject(localizedValues)) {
      continue;
    }
    const fieldId = key.slice(1);
    const match = findLocalizedValue(localizedValues, locales);
    if (match) {
      overridden.add(fieldId);
      set(fieldId, resolveNode(match.value, locales, options));
    }
    if (!options.keepLocalizedValues) {
      const rest = {...metadata};
      delete rest.localizedValues;
      set(key, Object.keys(rest).length > 0 ? rest : undefined);
    }
  }

  for (const key in node) {
    if (key.startsWith('@') || overridden.has(key)) {
      continue;
    }
    const value = node[key];
    const resolved = resolveNode(value, locales, options);
    if (resolved !== value) {
      set(key, resolved);
    }
  }
  return out || node;
}

/**
 * Returns the localized value for the first locale in `locales` that has one,
 * or `null` if none do.
 */
function findLocalizedValue(
  localizedValues: Record<string, any>,
  locales: string[]
): {value: any} | null {
  for (const locale of locales) {
    if (localizedValues[locale] !== undefined) {
      return {value: localizedValues[locale]};
    }
    const lowerLocale = String(locale).toLowerCase();
    for (const key in localizedValues) {
      if (
        key.toLowerCase() === lowerLocale &&
        localizedValues[key] !== undefined
      ) {
        return {value: localizedValues[key]};
      }
    }
  }
  return null;
}

function isPlainObject(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
