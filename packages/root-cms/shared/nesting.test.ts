import {describe, expect, it} from 'vitest';
import {
  checkNestingDepth,
  checkNestingDepthForUpdates,
  FIRESTORE_MAX_NESTING_DEPTH,
  formatNestingDepthMessage,
  getNestingDepth,
  getRemainingNestingDepth,
  measureNestingDepth,
} from './nesting.js';

/** Builds a value nested `levels` maps deep, e.g. 2 => `{a: {a: 'leaf'}}`. */
function nest(levels: number): any {
  let value: any = 'leaf';
  for (let i = 0; i < levels; i++) {
    value = {a: value};
  }
  return value;
}

describe('getNestingDepth', () => {
  it('counts the containers a field sits inside', () => {
    expect(getNestingDepth('fields')).toBe(0);
    expect(getNestingDepth('fields.meta')).toBe(1);
    expect(getNestingDepth('fields.meta.title')).toBe(2);
  });

  it('treats an empty key as the doc root', () => {
    expect(getNestingDepth('')).toBe(0);
    expect(getNestingDepth('   ')).toBe(0);
  });
});

describe('getRemainingNestingDepth', () => {
  it('returns the levels still available below a key', () => {
    expect(getRemainingNestingDepth('fields')).toBe(20);
    expect(getRemainingNestingDepth('fields.a.b')).toBe(18);
  });

  it('never goes negative', () => {
    const deepKey = new Array(30).fill('a').join('.');
    expect(getRemainingNestingDepth(deepKey)).toBe(0);
  });
});

describe('measureNestingDepth', () => {
  it('reports the base key depth for a leaf value', () => {
    expect(measureNestingDepth('hello', 'fields.title')).toEqual({
      depth: 1,
      deepKey: 'fields.title',
    });
  });

  it('counts each map level', () => {
    expect(measureNestingDepth({a: {b: 1}}, 'fields')).toEqual({
      depth: 2,
      deepKey: 'fields.a.b',
    });
  });

  it('counts each array level', () => {
    expect(measureNestingDepth({a: [{b: 1}]}, 'fields')).toEqual({
      depth: 3,
      deepKey: 'fields.a.0.b',
    });
  });

  it('counts ArrayObject items the same as array items', () => {
    const arrayObject = {_array: ['abc'], abc: {meta: {title: 'Hello'}}};
    expect(measureNestingDepth(arrayObject, 'fields.items')).toEqual({
      depth: 4,
      deepKey: 'fields.items.abc.meta.title',
    });
    // The equivalent unmarshaled array nests to the same depth.
    expect(
      measureNestingDepth([{meta: {title: 'Hello'}}], 'fields.items').depth
    ).toBe(4);
  });

  it('counts top-level fields as depth 0 when walking from the doc root', () => {
    expect(measureNestingDepth({fields: {title: 'Hello'}})).toEqual({
      depth: 1,
      deepKey: 'fields.title',
    });
  });

  it('reports the deepest branch', () => {
    const value = {shallow: 1, deep: {a: {b: {c: 1}}}};
    expect(measureNestingDepth(value, 'fields')).toEqual({
      depth: 4,
      deepKey: 'fields.deep.a.b.c',
    });
  });

  it('treats an empty container as a leaf', () => {
    expect(measureNestingDepth({a: {}}, 'fields')).toEqual({
      depth: 1,
      deepKey: 'fields.a',
    });
  });

  it('treats non-plain objects as leaves', () => {
    // Stand-in for a Firestore Timestamp or FieldValue sentinel, which are
    // stored as a single value rather than as a nested map.
    class Timestamp {
      constructor(
        readonly seconds: number,
        readonly nanoseconds: number
      ) {}
    }
    const value = {publishedAt: new Timestamp(0, 0)};
    expect(measureNestingDepth(value, 'sys')).toEqual({
      depth: 1,
      deepKey: 'sys.publishedAt',
    });
  });

  it('bails out of cyclic values', () => {
    const value: any = {a: {}};
    value.a.self = value;
    const result = measureNestingDepth(value, 'fields');
    expect(result.depth).toBeGreaterThan(FIRESTORE_MAX_NESTING_DEPTH);
    expect(result.depth).toBeLessThan(50);
  });
});

describe('checkNestingDepth', () => {
  it('returns null for values well within the limit', () => {
    expect(checkNestingDepth('fields', {meta: {title: 'Hello'}})).toBe(null);
  });

  /**
   * Firestore accepts a field path of up to 21 segments and rejects the 22nd,
   * i.e. a value may sit inside at most 20 maps or arrays. This is the line
   * the whole feature hangs off of, so pin it down explicitly.
   */
  it('matches the depth Firestore actually accepts', () => {
    // `fields` is depth 0, so 20 more maps lands the leaf at depth 20 — the
    // deepest write Firestore accepts.
    const atLimit = checkNestingDepth('fields', nest(20), {warningBuffer: 0});
    expect(atLimit).toBe(null);

    const overLimit = checkNestingDepth('fields', nest(21), {
      warningBuffer: 0,
    });
    expect(overLimit?.severity).toBe('error');
    expect(overLimit?.depth).toBe(21);
    // 21 nesting levels = a 22-segment field path.
    expect(overLimit?.deepKey.split('.')).toHaveLength(22);
  });

  it('warns as the value approaches the limit', () => {
    const issue = checkNestingDepth('fields', nest(19));
    expect(issue?.severity).toBe('warning');
    expect(issue?.depth).toBe(19);
    expect(issue?.limit).toBe(20);
  });

  it('counts the depth of the key itself', () => {
    const issue = checkNestingDepth('fields.a.b.c', nest(19));
    expect(issue?.severity).toBe('error');
    expect(issue?.depth).toBe(22);
  });

  it('honors a custom limit and warning buffer', () => {
    expect(checkNestingDepth('fields', nest(3), {limit: 5})).toBe(null);
    expect(checkNestingDepth('fields', nest(4), {limit: 5})?.severity).toBe(
      'warning'
    );
    expect(
      checkNestingDepth('fields', nest(4), {limit: 5, warningBuffer: 0})
    ).toBe(null);
    expect(checkNestingDepth('fields', nest(6), {limit: 5})?.severity).toBe(
      'error'
    );
  });
});

describe('checkNestingDepthForUpdates', () => {
  it('checks each update against its own key depth', () => {
    const issues = checkNestingDepthForUpdates({
      'fields.title': 'Hello',
      'fields.body': nest(21),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].deepKey.startsWith('fields.body')).toBe(true);
  });

  it('sorts the deepest issue first', () => {
    const issues = checkNestingDepthForUpdates({
      'fields.a': nest(19),
      'fields.b': nest(23),
    });
    expect(issues.map((issue) => issue.severity)).toEqual(['error', 'warning']);
  });

  it('returns an empty list for an empty payload', () => {
    expect(checkNestingDepthForUpdates({})).toEqual([]);
  });
});

describe('formatNestingDepthMessage', () => {
  it('names the offending field and the limit', () => {
    const issue = checkNestingDepth('fields', nest(21))!;
    const message = formatNestingDepthMessage(issue);
    expect(message).toContain('nested 21 levels deep');
    expect(message).toContain('20 levels deep');
  });

  it('reports remaining headroom in a warning', () => {
    const issue = checkNestingDepth('fields', nest(19))!;
    expect(formatNestingDepthMessage(issue)).toContain('19 of 20 levels');
  });
});
