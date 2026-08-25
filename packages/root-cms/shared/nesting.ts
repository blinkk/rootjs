/**
 * Isomorphic helpers for Firestore's field nesting limit.
 *
 * Firestore refuses to write a document where a field is nested more than 20
 * levels deep, counting each map and each array the value sits inside as one
 * level. A top-level field is therefore at depth 0, `fields.hero` is at depth
 * 1, and so on — i.e. depth is the field path's segment count minus one, which
 * is also how the Firestore admin SDK counts it.
 *
 * The limit is easy to hit in the CMS because containers stack up quickly:
 *
 * - An array field costs two levels per item, since arrays are stored as
 *   "ArrayObjects" (`{_array: ['abc'], abc: {...}}`) — one level for the array
 *   map and one for the item key.
 * - An `object` or `oneof` field costs one level.
 * - A rich text field costs three (`blocks` → item → `data`), plus more for
 *   nested lists.
 *
 * A schema whose components reference each other (a "section" that can hold
 * more "sections") can therefore bottom out after only a handful of visible
 * nesting steps, and the write fails with an opaque Firestore error. These
 * helpers let the CMS measure depth up front and warn instead.
 *
 * ```ts
 * const issue = checkNestingDepth('fields.a.b', value);
 * if (issue) {
 *   console.warn(formatNestingDepthMessage(issue));
 * }
 * ```
 */

/** Maximum nesting depth that Firestore accepts for a field. */
export const FIRESTORE_MAX_NESTING_DEPTH = 20;

/**
 * Number of remaining levels that still produces a `warning`. Editors get a
 * heads-up while there's room left to restructure the content.
 */
export const NESTING_DEPTH_WARNING_BUFFER = 2;

/**
 * Levels traversed past the limit before giving up. Bounds the walk for values
 * that are pathologically deep or contain a cycle; the exact depth doesn't
 * matter once the limit is blown.
 */
const MAX_TRAVERSAL_OVERSHOOT = 10;

/** Severity of a nesting depth issue. */
export type NestingDepthSeverity = 'warning' | 'error';

/** The deepest field found within a value. */
export interface NestingDepthResult {
  /** Nesting depth of the deepest field. */
  depth: number;
  /** Deep key of the deepest field, e.g. `fields.hero.items.abc.title`. */
  deepKey: string;
}

/** A field that has reached or exceeded the nesting limit. */
export interface NestingDepthIssue extends NestingDepthResult {
  /** The limit that was measured against. */
  limit: number;
  /** `error` once the limit is exceeded, `warning` when close to it. */
  severity: NestingDepthSeverity;
}

/** Options for the nesting depth checks. */
export interface NestingDepthOptions {
  /** Depth limit. Defaults to `FIRESTORE_MAX_NESTING_DEPTH`. */
  limit?: number;
  /**
   * Number of remaining levels that still produces a `warning`. Defaults to
   * `NESTING_DEPTH_WARNING_BUFFER`. Pass `0` to only report `error`s.
   */
  warningBuffer?: number;
}

/**
 * Returns the nesting depth of a deep key, i.e. the number of maps or arrays
 * the value sits inside: `fields` => 0, `fields.meta` => 1,
 * `fields.meta.title` => 2.
 */
export function getNestingDepth(deepKey: string): number {
  const key = (deepKey || '').trim();
  if (!key) {
    return 0;
  }
  return key.split('.').length - 1;
}

/**
 * Returns the number of nesting levels still available below a deep key. A
 * value of 0 means nothing can be nested any deeper.
 */
export function getRemainingNestingDepth(
  deepKey: string,
  limit = FIRESTORE_MAX_NESTING_DEPTH
): number {
  return Math.max(0, limit - getNestingDepth(deepKey));
}

/**
 * Walks a value and returns its deepest field, assuming the value itself is
 * stored at `baseKey`. Only plain objects and arrays add depth; everything
 * else (including Firestore `Timestamp`s and `FieldValue` sentinels) is a leaf.
 */
export function measureNestingDepth(
  value: any,
  baseKey = '',
  options?: NestingDepthOptions
): NestingDepthResult {
  const limit = options?.limit ?? FIRESTORE_MAX_NESTING_DEPTH;
  // The walk counts field path segments rather than nesting levels, since the
  // doc root (an empty base key) and a top-level field would otherwise both
  // read as depth 0.
  const baseSegments = baseKey ? baseKey.split('.').length : 0;
  const maxSegments = limit + 1 + MAX_TRAVERSAL_OVERSHOOT;
  let deepestSegments = baseSegments;
  let deepestKey = baseKey;

  const walk = (val: any, segments: number, deepKey: string) => {
    if (segments > deepestSegments) {
      deepestSegments = segments;
      deepestKey = deepKey;
    }
    if (segments >= maxSegments) {
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((item, i) =>
        walk(item, segments + 1, joinKey(deepKey, `${i}`))
      );
      return;
    }
    if (isPlainObject(val)) {
      for (const key of Object.keys(val)) {
        walk(val[key], segments + 1, joinKey(deepKey, key));
      }
    }
  };

  walk(value, baseSegments, baseKey);
  return {depth: Math.max(0, deepestSegments - 1), deepKey: deepestKey};
}

/**
 * Checks the value that will be written at `deepKey` and returns an issue when
 * it reaches or exceeds the nesting limit, or `null` when it's within bounds.
 */
export function checkNestingDepth(
  deepKey: string,
  value: any,
  options?: NestingDepthOptions
): NestingDepthIssue | null {
  const limit = options?.limit ?? FIRESTORE_MAX_NESTING_DEPTH;
  const warningBuffer = options?.warningBuffer ?? NESTING_DEPTH_WARNING_BUFFER;
  const deepest = measureNestingDepth(value, deepKey, {limit});
  if (deepest.depth > limit) {
    return {...deepest, limit, severity: 'error'};
  }
  if (deepest.depth > limit - warningBuffer) {
    return {...deepest, limit, severity: 'warning'};
  }
  return null;
}

/**
 * Checks a Firestore `updateDoc()` payload, whose keys are deep keys and whose
 * values are written at those keys. Returns one issue per offending update,
 * most deeply nested first.
 */
export function checkNestingDepthForUpdates(
  updates: Record<string, any>,
  options?: NestingDepthOptions
): NestingDepthIssue[] {
  const issues: NestingDepthIssue[] = [];
  for (const deepKey of Object.keys(updates || {})) {
    const issue = checkNestingDepth(deepKey, updates[deepKey], options);
    if (issue) {
      issues.push(issue);
    }
  }
  issues.sort((a, b) => b.depth - a.depth);
  return issues;
}

/** Returns a human-readable message describing a nesting depth issue. */
export function formatNestingDepthMessage(issue: NestingDepthIssue): string {
  const suffix =
    'Firestore cannot save fields nested more than ' +
    `${issue.limit} levels deep. Flatten the content, or split it into a ` +
    'separate doc and use a reference field.';
  if (issue.severity === 'error') {
    return `"${issue.deepKey}" is nested ${issue.depth} levels deep. ${suffix}`;
  }
  return (
    `"${issue.deepKey}" is nested ${issue.depth} of ${issue.limit} levels ` +
    `deep. ${suffix}`
  );
}

/** Joins a deep key with a child segment. */
function joinKey(deepKey: string, segment: string): string {
  return deepKey ? `${deepKey}.${segment}` : segment;
}

/** Returns true for plain objects (object literals, JSON-parsed objects). */
function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
