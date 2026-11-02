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

/** Characters allowed in an array item key. */
const ARRAY_KEY_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Returns true if `key` can be stored as an array item key. Older docs can have
 * human-readable keys, which are fine, but a number isn't an acceptable key:
 * it's indistinguishable from an array index in a doc path, which is how
 * numeric keys end up in a doc in the first place.
 */
export function testValidArrayKey(key: unknown): key is string {
  return (
    typeof key === 'string' && ARRAY_KEY_RE.test(key) && !/^\d+$/.test(key)
  );
}

export interface ArrayObjectPathError {
  /** The path segment where resolution failed. */
  path: string;
  /** Human-readable error message. */
  message: string;
  /** Expected path segment or current data shape. */
  expected?: string;
  /** Actual path segment or current data shape. */
  received?: any;
}

export type ArrayObjectPathResult =
  | {ok: true; path: string; segments: string[]}
  | {ok: false; error: ArrayObjectPathError};

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
 * Converts a user-facing CMS path with array indices into the stored
 * Firestore path that uses ArrayObject keys.
 */
export function resolveArrayObjectPath(
  data: any,
  path: string
): ArrayObjectPathResult {
  const trimmed = path.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        path,
        message: 'Path is required.',
        expected: 'non-empty field path',
        received: path,
      },
    };
  }

  const segments = trimmed.split('.');
  const storageSegments: string[] = [];
  let current = data;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentPath = segments.slice(0, i + 1).join('.');
    const isIndex = /^(0|[1-9]\d*)$/.test(segment);

    if (isIndex) {
      if (isArrayObject(current)) {
        const key = current._array[Number(segment)];
        if (key === undefined) {
          return {
            ok: false,
            error: {
              path: segmentPath,
              message: 'Array index is out of range for the current draft.',
              expected: 'existing array item',
              received: segment,
            },
          };
        }
        storageSegments.push(key);
        current = current[key];
        continue;
      }

      return {
        ok: false,
        error: {
          path: segmentPath,
          message:
            'Array index path segments can only target existing CMS array items.',
          expected: 'array object',
          received: getType(current),
        },
      };
    }

    if (isArrayObject(current)) {
      return {
        ok: false,
        error: {
          path: segmentPath,
          message:
            'Array fields must be followed by a zero-based numeric index before nested fields.',
          expected: 'array index',
          received: segment,
        },
      };
    }

    storageSegments.push(segment);
    current =
      current !== null && typeof current === 'object'
        ? current[segment]
        : undefined;
  }

  return {ok: true, path: storageSegments.join('.'), segments: storageSegments};
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
    return toArrayObject(data, (item) => marshalData(item, options));
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
 * Converts a plain array to an ArrayObject, calling `marshalItem` on each item.
 * An item's `_arrayKey` is reused as its key, unless the key is invalid (see
 * `testValidArrayKey`) or already used, since a duplicate would make two items
 * share the same value.
 */
export function toArrayObject(
  items: any[],
  marshalItem: (item: any) => any
): ArrayObject {
  const obj: Record<string, any> = {};
  const keys: string[] = [];
  for (const item of items) {
    const itemKey =
      item && typeof item === 'object' ? item._arrayKey : undefined;
    let key = testValidArrayKey(itemKey) ? itemKey : randKey();
    while (keys.includes(key)) {
      key = randKey();
    }
    keys.push(key);
    const cleaned = item && typeof item === 'object' ? {...item} : item;
    if (cleaned && typeof cleaned === 'object') {
      delete cleaned._arrayKey;
    }
    obj[key] = marshalItem(cleaned);
  }
  obj._array = keys;
  return obj as ArrayObject;
}

/**
 * Reads the items of an array field from a map that may not be a valid
 * ArrayObject, returning them as plain items with an `_arrayKey`. Returns
 * `null` if `value` isn't a map of items. Handles:
 *
 * - A missing `_array`, using the order of the map (numeric keys ascending).
 * - `_array` entries that are duplicated or have no matching item.
 * - Items missing from `_array`. A numeric key for an index that exists is a
 *   write to `<array>.<index>.<field>` that went to the map instead of the
 *   item, so it's merged into that item. Others are added to the end.
 *
 * `repaired` is true if the map wasn't valid.
 */
export function repairArrayObject(
  value: any
): {items: any[]; repaired: boolean} | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const hasOrder = Array.isArray(value._array);
  const mapKeys = Object.keys(value).filter((key) => key !== '_array');
  const isItem = (item: any) =>
    item !== null && typeof item === 'object' && !Array.isArray(item);
  if (!hasOrder && !mapKeys.every((key) => isItem(value[key]))) {
    return null;
  }

  const order: string[] = hasOrder
    ? value._array.filter(
        (key: any, index: number) =>
          typeof key === 'string' &&
          Object.hasOwn(value, key) &&
          value._array.indexOf(key) === index
      )
    : [];
  // Object keys that look like integers always come first, in ascending order.
  const orphans = mapKeys.filter((key) => !order.includes(key));
  const merges = new Map<number, any>();
  const extras: string[] = [];
  for (const key of orphans) {
    const index = Number(key);
    if (hasOrder && /^\d+$/.test(key) && index < order.length) {
      merges.set(index, value[key]);
    } else {
      extras.push(key);
    }
  }

  const toItem = (key: string, index: number) => {
    const item = unmarshalData(value[key], {preserveArrayKeys: true});
    return isItem(item)
      ? {...item, ...unmarshalMerge(merges.get(index)), _arrayKey: key}
      : item;
  };
  const items = [...order, ...extras].map(toItem);
  const repaired =
    !hasOrder ||
    order.length !== value._array.length ||
    orphans.length > 0 ||
    order.some((key) => !testValidArrayKey(key));
  return {items, repaired};
}

function unmarshalMerge(item: any): any {
  return item === undefined
    ? undefined
    : unmarshalData(item, {preserveArrayKeys: true});
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
    /**
     * Set `_arrayKey` on array items so that marshaling the data again keeps
     * the original keys.
     */
    preserveArrayKeys?: boolean;
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
    return data._array.map((key: string) => {
      const item = unmarshalData(data[key] ?? {}, options);
      if (options?.preserveArrayKeys && item && typeof item === 'object') {
        return {...item, _arrayKey: key};
      }
      return item;
    });
  }
  // Regular object.
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = unmarshalData(v, options);
  }
  return out;
}

/** Generates a random 6-char alphanumeric key that isn't all digits. */
function randKey(): string {
  let key = '';
  while (key.length < 6 || !testValidArrayKey(key)) {
    key = Math.random().toString(36).slice(2, 8);
  }
  return key;
}

function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
  return typeof value;
}
