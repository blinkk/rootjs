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

function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
  return typeof value;
}

/**
 * Recursively walks stored (marshaled) Firestore data and returns the dotted
 * paths of every node for which `predicate` returns true. The returned paths use
 * stored ArrayObject keys (not numeric indices), so they can be passed directly
 * to a Firestore `update()` call as field paths.
 *
 * Traversal rules:
 * - If `predicate(node)` is true, the node's path is collected and the walk does
 *   NOT descend into it (matched value objects have no nested matches).
 * - Rich text data (EditorJS format) is skipped entirely.
 * - ArrayObjects are traversed via their `_array` key order; the `_array` key
 *   itself is not treated as a child.
 * - For plain objects (including oneOf blocks carrying a `_type` discriminator),
 *   keys beginning with `_` (internal markers) or `@` (field metadata siblings)
 *   are not descended.
 *
 * Note: this operates on RAW stored data (ArrayObject shape), not the output of
 * `unmarshalData` (plain arrays).
 *
 * @param data The stored data to walk (e.g. a doc's `fields` object).
 * @param predicate Returns true for nodes whose path should be collected.
 * @param options.prefix A path prefix to prepend to every collected path.
 */
export function collectPathsByPredicate(
  data: any,
  predicate: (node: any) => boolean,
  options?: {prefix?: string}
): string[] {
  const results: string[] = [];

  function walk(node: any, path: string) {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (predicate(node)) {
      if (path) {
        results.push(path);
      }
      return;
    }
    // Do not descend into rich text data (EditorJS format).
    if (isRichTextData(node)) {
      return;
    }
    if (isArrayObject(node)) {
      for (const key of node._array) {
        walk(node[key], path ? `${path}.${key}` : key);
      }
      return;
    }
    if (Array.isArray(node)) {
      // Plain arrays should not appear in stored data (arrays are stored as
      // ArrayObjects), but handle them defensively.
      for (let i = 0; i < node.length; i++) {
        walk(node[i], path ? `${path}.${i}` : String(i));
      }
      return;
    }
    for (const key of Object.keys(node)) {
      // Skip internal markers (`_array`, `_type`, `_arrayKey`, ...) and field
      // metadata siblings (`@<fieldname>`).
      if (key.startsWith('_') || key.startsWith('@')) {
        continue;
      }
      walk(node[key], path ? `${path}.${key}` : key);
    }
  }

  walk(data, options?.prefix || '');
  return results;
}
