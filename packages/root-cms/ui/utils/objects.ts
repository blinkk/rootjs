/** @fileoverview Utility functions for working with objects. */

export function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

/**
 * Returns the nested value of an object. E.g.:
 *
 * ```
 * getNestedValue({meta: {title: 'Foo'}}, 'meta.title');
 * // => Foo
 * ```
 *
 * If the value does not exist, `undefined` is returned.
 */
export function getNestedValue(data: any, key: string) {
  const keys = key.split('.');
  let current = data;
  for (const segment of keys) {
    if (!current) {
      current = {};
    }
    current = current[segment];
  }
  return current;
}

/**
 * Flattens the keys of an object that may contain nested data. E.g.:
 * ```
 * flattenNestedKeys({meta: {title: 'Foo'}})
 * // => {'meta.title': 'Foo'}
 * ```
 */
export function flattenNestedKeys(data: any) {
  const flatData: any = {};
  for (const key in data) {
    if (isObject(data[key])) {
      const nestedValue = data[key];
      const flatNestedData = flattenNestedKeys(nestedValue);
      for (const x in flatNestedData) {
        flatData[`${key}.${x}`] = flatNestedData[x];
      }
    } else {
      flatData[key] = data[key];
    }
  }

  return flatData;
}
