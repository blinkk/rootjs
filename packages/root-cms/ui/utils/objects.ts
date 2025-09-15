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
 *
 * // With fallbacks:
 * getNestedValue(data, ['meta.image', 'meta.thumbnail']);
 * ```
 *
 * If the value does not exist, `undefined` is returned. When an array of keys
 * is provided, the first defined value is returned.
 */
export function getNestedValue(data: any, key: string | string[]): any {
  if (Array.isArray(key)) {
    for (const k of key) {
      const value = getNestedValue(data, k);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  const segments = key.split('.');
  let current = data;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }

    current = resolveSegment(current, segment);
  }
  return current;
}

function resolveSegment(data: any, segment: string): any {
  if (!segment) {
    return data;
  }

  // eslint-disable-next-line no-useless-escape
  const matcher = /([^\[\]]+)|\[(\d+)\]/g;
  let current = data;

  let match: RegExpExecArray | null;
  while ((match = matcher.exec(segment))) {
    if (current === undefined || current === null) {
      return undefined;
    }

    const property = match[1];
    const index = match[2];
    if (property !== undefined) {
      current = current[property];
      continue;
    }

    if (index === undefined) {
      return undefined;
    }
    const arrayIndex = Number(index);
    if (Array.isArray(current)) {
      current = current[arrayIndex];
      continue;
    }

    if (isObject(current) && Array.isArray(current._array)) {
      const key = current._array[arrayIndex];
      if (key === undefined) {
        return undefined;
      }
      current = current[key];
      continue;
    }

    if (
      isObject(current) &&
      Object.prototype.hasOwnProperty.call(current, String(arrayIndex))
    ) {
      current = current[String(arrayIndex)];
      continue;
    }

    return undefined;
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

/**
 * Sorts an array of objects by key.
 */
export function sortByKey(objs: any[], key: string) {
  return objs.sort((a: any, b: any) => {
    const x = a[key];
    const y = b[key];
    if (x < y) {
      return -1;
    }
    if (x > y) {
      return 1;
    }
    return 0;
  });
}

export function deepEqual(obj1: any, obj2: any) {
  if (obj1 === obj2) {
    return true;
  }

  if (
    typeof obj1 !== 'object' ||
    obj1 === null ||
    typeof obj2 !== 'object' ||
    obj2 === null
  ) {
    return false;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }

    for (let i = 0; i < obj1.length; i++) {
      if (!deepEqual(obj1[i], obj2[i])) {
        return false;
      }
    }

    return true;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}
