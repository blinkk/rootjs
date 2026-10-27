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
 * locale). The default value is used when the locale (and any of its
 * `fallbacks`, see `resolveLocalizedValues()`) has no localized value.
 */

import type {Field} from '../core/schema.js';
import {isRichTextData} from './marshal.js';

/** Field types that are localizable by default (see `field.localizable`). */
const LOCALIZABLE_FIELD_TYPES = new Set([
  'boolean',
  'date',
  'datetime',
  'file',
  'image',
  'multiselect',
  'number',
  'reference',
  'references',
  'richtext',
  'select',
  'string',
]);

/**
 * Returns whether editors can set localized values for a field.
 */
export function testFieldLocalizable(field: Field): boolean {
  if (!field.id) {
    return false;
  }
  if (typeof field.localizable === 'boolean') {
    return field.localizable;
  }
  return LOCALIZABLE_FIELD_TYPES.has(field.type);
}

/**
 * Returns the locales in a field's `localizedValues` map, sorted
 * alphabetically (Firestore doesn't preserve the key order of maps). Keys
 * starting with `@` hold metadata for a localized value (e.g. `@de`) and are
 * excluded.
 */
export function getLocalizedValueLocales(localizedValues: any): string[] {
  if (!isPlainObject(localizedValues)) {
    return [];
  }
  return Object.keys(localizedValues)
    .filter((key) => !key.startsWith('@') && localizedValues[key] !== undefined)
    .sort();
}

export interface ResolveLocalizedValuesOptions {
  /**
   * Locales to check, in order of precedence, when the locale has no localized
   * value, e.g. `["en-GB"]` for `en-CA`. Unlike translations, localized values
   * don't follow the `i18n.fallbacks` config, so by default a locale without a
   * localized value uses the field's default value.
   */
  fallbacks?: string[];
  /**
   * Keeps the `localizedValues` in the `@<id>` metadata of the returned data.
   * By default they're removed, since they're no longer needed once resolved
   * and can be large (e.g. an image for every locale).
   */
  keepLocalizedValues?: boolean;
}

/**
 * Returns a copy of `data` with each field that has localized values replaced
 * by the localized value for `locale`, or for the first of
 * `options.fallbacks` with one. Locales are matched case-insensitively.
 *
 * The input is never mutated. Objects that don't contain any localized values
 * are returned as-is (not copied), so unchanged subtrees are shared between
 * the input and the output.
 *
 * ```ts
 * const doc = resolveLocalizedValues(rawDoc, 'en-CA', {fallbacks: ['en-GB']});
 * ```
 */
export function resolveLocalizedValues<T>(
  data: T,
  locale: string,
  options?: ResolveLocalizedValuesOptions
): T {
  const chain = [locale, ...(options?.fallbacks || [])];
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
