/**
 * Shared marshaling utilities for converting between plain arrays and
 * Firestore-friendly "ArrayObject" format. These are pure functions with no
 * Firebase dependency so they can run on both client and server.
 *
 * Rich text fields (detected by having `time`, `version`, and `blocks`
 * properties) are returned as-is without any marshalling.
 */

export interface ArrayObject {
  [key: string]: any;
  _array: string[];
}

/**
 * Returns true if `data` looks like an already-marshaled ArrayObject (has an
 * `_array` key that is a string[]).
 */
export function isArrayObject(data: any): data is ArrayObject {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data._array)
  );
}

/**
 * Returns true if `data` looks like a rich text data object (EditorJS format
 * with `time`, `version`, and `blocks` properties).
 */
export function isRichTextData(data: any): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray(data.blocks) &&
    typeof data.time === 'number' &&
    typeof data.version === 'string'
  );
}

/**
 * Recursively marshals data for Firestore storage:
 * - Plain arrays are converted to ArrayObject format.
 * - Rich text data (EditorJS format) is returned as-is without marshalling.
 * - Items with an `_arrayKey` property use that as their key in the object.
 *
 * Accepts an optional `isTimestamp` predicate to handle Timestamp-like objects.
 */
export function marshalData(
  data: any,
  options?: {isTimestamp?: (v: any) => boolean}
): any {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (options?.isTimestamp?.(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    const obj: Record<string, any> = {};
    const keys: string[] = [];
    for (const item of data) {
      const key =
        item && typeof item === 'object' && typeof item._arrayKey === 'string'
          ? item._arrayKey
          : randKey();
      keys.push(key);
      const cleaned = item && typeof item === 'object' ? {...item} : item;
      if (cleaned && typeof cleaned === 'object') {
        delete cleaned._arrayKey;
      }
      obj[key] = marshalData(cleaned, options);
    }
    obj._array = keys;
    return obj;
  }
  // Rich text data (EditorJS format) should remain as-is. Do not marshal
  // the blocks array or any of its children.
  if (isRichTextData(data)) {
    return data;
  }
  // Regular object.
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = marshalData(v, options);
  }
  return out;
}

/**
 * Recursively unmarshals data from Firestore format:
 * - ArrayObjects (objects with `_array`) are converted back to plain arrays.
 * - Timestamp-like objects (with a `toMillis` method) are converted to millis.
 *
 * Accepts an optional `isTimestamp` predicate and `toValue` converter for
 * handling Timestamp-like objects.
 */
export function unmarshalData(
  data: any,
  options?: {
    isTimestamp?: (v: any) => boolean;
    timestampToValue?: (v: any) => any;
  }
): any {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => unmarshalData(item, options));
  }
  // Timestamp-like objects.
  if (options?.isTimestamp?.(data)) {
    return options.timestampToValue ? options.timestampToValue(data) : data;
  }
  // Default: detect toMillis() method.
  if (typeof data.toMillis === 'function') {
    return data.toMillis();
  }
  // ArrayObject → array.
  if (isArrayObject(data)) {
    return data._array.map((key: string) =>
      unmarshalData(data[key] ?? {}, options)
    );
  }
  // Regular object.
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = unmarshalData(v, options);
  }
  return out;
}

/** Generates a random 6-char alphanumeric key. */
function randKey(): string {
  return Math.random().toString(36).slice(2, 8);
}
