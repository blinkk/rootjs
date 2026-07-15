import {describe, it, expect} from 'vitest';
import {
  compareSortKeys,
  generateKeyAfter,
  generateKeyBetween,
  generateNKeysBetween,
} from './sort-key.js';

describe('generateKeyBetween', () => {
  it('returns the initial key when both bounds are null', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
  });

  it('generates keys strictly between the bounds', () => {
    const a = generateKeyBetween(null, null);
    const b = generateKeyBetween(a, null);
    const mid = generateKeyBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
    const before = generateKeyBetween(null, a);
    expect(before < a).toBe(true);
  });

  it('throws when a >= b', () => {
    expect(() => generateKeyBetween('a1', 'a1')).toThrow();
    expect(() => generateKeyBetween('a2', 'a1')).toThrow();
  });

  it('throws on malformed keys', () => {
    expect(() => generateKeyBetween('a10', null)).toThrow(); // trailing zero
    expect(() => generateKeyBetween('!', null)).toThrow(); // bad head
    expect(() => generateKeyBetween('b1', null)).toThrow(); // truncated integer
  });

  it('never generates keys with a trailing zero', () => {
    const prev = generateKeyBetween(null, null);
    let next = generateKeyBetween(prev, null);
    for (let i = 0; i < 100; i++) {
      const mid = generateKeyBetween(prev, next);
      expect(mid.endsWith('0')).toBe(false);
      next = mid;
    }
  });

  it('stays ordered over long append chains', () => {
    const keys: string[] = [];
    let key: string | null = null;
    for (let i = 0; i < 1000; i++) {
      key = generateKeyBetween(key, null);
      keys.push(key);
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  it('stays ordered over long prepend chains', () => {
    const keys: string[] = [];
    let key: string | null = null;
    for (let i = 0; i < 1000; i++) {
      key = generateKeyBetween(null, key);
      keys.unshift(key);
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  it('stays ordered over repeated same-gap insertions', () => {
    const a = generateKeyBetween(null, null);
    let b = generateKeyBetween(a, null);
    for (let i = 0; i < 100; i++) {
      const mid = generateKeyBetween(a, b);
      expect(a < mid).toBe(true);
      expect(mid < b).toBe(true);
      b = mid;
    }
  });

  it('stays ordered over randomized insertions', () => {
    // Deterministic PRNG so failures are reproducible.
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const keys = [generateKeyBetween(null, null)];
    for (let i = 0; i < 500; i++) {
      const index = Math.floor(random() * (keys.length + 1));
      const a = index === 0 ? null : keys[index - 1];
      const b = index === keys.length ? null : keys[index];
      keys.splice(index, 0, generateKeyBetween(a, b));
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });
});

describe('generateNKeysBetween', () => {
  it('handles n=0 and n=1', () => {
    expect(generateNKeysBetween(null, null, 0)).toEqual([]);
    expect(generateNKeysBetween(null, null, 1)).toEqual(['a0']);
  });

  it('returns n distinct sorted keys between the bounds', () => {
    const testCases: Array<[string | null, string | null]> = [
      [null, null],
      ['a0', null],
      [null, 'a0'],
      ['a0', 'a1'],
      ['a1', 'a2'],
      ['a0V', 'a1'],
    ];
    for (const [a, b] of testCases) {
      const keys = generateNKeysBetween(a, b, 25);
      expect(keys.length).toBe(25);
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) {
          expect(keys[i - 1] < keys[i]).toBe(true);
        }
        if (a !== null) {
          expect(a < keys[i]).toBe(true);
        }
        if (b !== null) {
          expect(keys[i] < b).toBe(true);
        }
      }
    }
  });
});

describe('generateKeyAfter', () => {
  it('generates a key after the given key', () => {
    expect(generateKeyAfter(null)).toBe('a0');
    expect(generateKeyAfter('a0')).toBe('a1');
    const key = generateKeyAfter('b0z');
    expect('b0z' < key).toBe(true);
  });
});

describe('compareSortKeys', () => {
  it('compares by code point, matching firestore string ordering', () => {
    // Digits < uppercase < lowercase in ascii order.
    expect(compareSortKeys('Zz', 'a0')).toBeLessThan(0);
    expect(compareSortKeys('a0', 'a0V')).toBeLessThan(0);
    expect(compareSortKeys('a0V', 'a1')).toBeLessThan(0);
    expect(compareSortKeys('a1', 'b00')).toBeLessThan(0);
    expect(compareSortKeys('a1', 'a1')).toBe(0);
    expect(compareSortKeys('a2', 'a1')).toBeGreaterThan(0);
  });

  it('sorts arrays the same as the generation order', () => {
    const keys: string[] = [];
    let key: string | null = null;
    for (let i = 0; i < 50; i++) {
      key = generateKeyBetween(key, null);
      keys.push(key);
    }
    const shuffled = [...keys].reverse();
    shuffled.sort(compareSortKeys);
    expect(shuffled).toEqual(keys);
  });
});
