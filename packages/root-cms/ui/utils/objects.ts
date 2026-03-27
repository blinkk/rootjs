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

export function cloneData<T>(data: T): T {
  if (data === undefined || data === null) {
    return data;
  }
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
}

/**
 * Returns a deep-cloned value with object keys sorted alphabetically.
 */
export function sortObjectKeysDeep<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.map((item) => sortObjectKeysDeep(item)) as T;
  }

  if (isObject(data)) {
    const sortedData: Record<string, unknown> = {};
    const keys = Object.keys(data as Record<string, unknown>).sort((a, b) =>
      a.localeCompare(b)
    );
    for (const key of keys) {
      sortedData[key] = sortObjectKeysDeep(
        (data as Record<string, unknown>)[key]
      );
    }
    return sortedData as T;
  }

  return data;
}

/** Snippet returned by `findFieldSnippet`. */
export interface FieldSnippet {
  /** Dot-notation path to the field, e.g. "meta.description". */
  fieldPath: string;
  /** Text before the matched portion. */
  before: string;
  /** The matched portion of the text. */
  match: string;
  /** Text after the matched portion. */
  after: string;
}

/**
 * Recursively searches a nested data structure for the first string value
 * containing `query` (case-insensitive) and returns a snippet with surrounding
 * context. Returns `null` if no match is found.
 */
export function findFieldSnippet(
  data: unknown,
  query: string,
  parentPath = ''
): FieldSnippet | null {
  if (data === null || data === undefined) {
    return null;
  }
  if (typeof data === 'string') {
    const lower = data.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) {
      return null;
    }
    const contextChars = 40;
    const start = Math.max(0, idx - contextChars);
    const end = Math.min(data.length, idx + query.length + contextChars);
    return {
      fieldPath: parentPath,
      before: (start > 0 ? '...' : '') + data.slice(start, idx),
      match: data.slice(idx, idx + query.length),
      after:
        data.slice(idx + query.length, end) + (end < data.length ? '...' : ''),
    };
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return findFieldSnippet(String(data), query, parentPath);
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const result = findFieldSnippet(data[i], query, `${parentPath}[${i}]`);
      if (result) {
        return result;
      }
    }
    return null;
  }
  if (isObject(data)) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj._array)) {
      const arr = obj._array as string[];
      for (let i = 0; i < arr.length; i++) {
        const result = findFieldSnippet(
          obj[arr[i]],
          query,
          `${parentPath}[${i}]`
        );
        if (result) {
          return result;
        }
      }
      return null;
    }
    for (const key of Object.keys(obj)) {
      if (key === 'sys' || key === '_type' || key === '_arrayKey') {
        continue;
      }
      const childPath = parentPath ? `${parentPath}.${key}` : key;
      const result = findFieldSnippet(obj[key], query, childPath);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

/**
 * Stringifies JSON-like data with stable object-key ordering.
 */
export function stableJsonStringify(data: unknown, space = 2): string {
  return JSON.stringify(sortObjectKeysDeep(data), null, space);
}
