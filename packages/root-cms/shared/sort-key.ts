/**
 * Fractional indexing utilities used for custom (user-defined) ordering of
 * docs within a collection (see the `customSorting` collection option).
 *
 * A "sort key" is an opaque base-62 string. Sorting keys in ascending order
 * (by code point) yields the custom order. `generateKeyBetween()` returns a
 * key strictly between two neighboring keys, so moving an item only requires
 * writing a new key to that one item.
 *
 * The base-62 digit alphabet is in ascending code-point order, which matches
 * how Firestore orders string fields, so `orderBy('sys.sortKey')` and
 * in-memory sorting with `compareSortKeys()` always agree.
 *
 * Vendored from https://github.com/rocicorp/fractional-indexing (MIT
 * license), based on the implementation described in
 * https://observablehq.com/@dgreensp/implementing-fractional-indexing.
 */

const BASE_62_DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const ZERO = BASE_62_DIGITS[0];
const SMALLEST_INTEGER = 'A' + ZERO.repeat(26);
const INTEGER_ZERO = 'a' + ZERO;

/**
 * Returns a key that sorts strictly between `a` and `b` (by code point).
 * Pass `a = null` for "before everything" and `b = null` for "after
 * everything"; `generateKeyBetween(null, null)` returns the initial key.
 * Throws if `a >= b` or if either key is malformed.
 */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a !== null) {
    validateSortKey(a);
  }
  if (b !== null) {
    validateSortKey(b);
  }
  if (a !== null && b !== null && a >= b) {
    throw new Error(`invalid sort key range: ${a} >= ${b}`);
  }
  if (a === null) {
    if (b === null) {
      return INTEGER_ZERO;
    }
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) {
      return ib + midpoint('', fb);
    }
    if (ib < b) {
      return ib;
    }
    const res = decrementInteger(ib);
    if (res === null) {
      throw new Error('cannot decrement any more');
    }
    return res;
  }

  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i === null ? ia + midpoint(fa, null) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb);
  }
  const i = incrementInteger(ia);
  if (i === null) {
    throw new Error('cannot increment any more');
  }
  if (i < b) {
    return i;
  }
  return ia + midpoint(fa, null);
}

/**
 * Returns `n` distinct keys in sorted order, all strictly between `a` and `b`
 * (same semantics as {@link generateKeyBetween}). Used for bulk-assigning
 * positions, e.g. when initializing the custom order of an existing
 * collection.
 */
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number
): string[] {
  if (n === 0) {
    return [];
  }
  if (n === 1) {
    return [generateKeyBetween(a, b)];
  }
  if (b === null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b);
      result.push(c);
    }
    return result;
  }
  if (a === null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b);
  return [
    ...generateNKeysBetween(a, c, mid),
    c,
    ...generateNKeysBetween(c, b, n - mid - 1),
  ];
}

/**
 * Returns a key that sorts after `a` (e.g. after the current max key to
 * append an item to the end of the list). Pass `null` when the list has no
 * keys yet.
 */
export function generateKeyAfter(a: string | null): string {
  return generateKeyBetween(a, null);
}

/**
 * Compares two sort keys by code point (the same ordering Firestore uses for
 * string fields). Intentionally not `localeCompare()`, whose locale-aware
 * collation can disagree with Firestore's byte ordering.
 */
export function compareSortKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Returns the midpoint between two fractional parts. `a` may be empty, `b`
 * may be null (meaning "no upper bound"); `a < b` is required when `b` is
 * non-null. Fractional parts never have trailing zeros.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`invalid sort key range: ${a} >= ${b}`);
  }
  if (a.slice(-1) === ZERO || (b && b.slice(-1) === ZERO)) {
    throw new Error('trailing zero in sort key');
  }
  if (b) {
    // Remove the longest common prefix, padding `a` with zeros as we go.
    // Note that `b` needs no padding: it can't end while traversing the
    // common prefix (no trailing zeros).
    let n = 0;
    while ((a[n] || ZERO) === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }
  // The first digits (or lack of digit) differ.
  const digitA = a ? BASE_62_DIGITS.indexOf(a[0]) : 0;
  const digitB =
    b !== null ? BASE_62_DIGITS.indexOf(b[0]) : BASE_62_DIGITS.length;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return BASE_62_DIGITS[midDigit];
  }
  // The first digits are consecutive.
  if (b && b.length > 1) {
    return b.slice(0, 1);
  }
  // `b` is null or has length 1 (a single digit). The first digit of the
  // result is the same as the first digit of `a`; recurse on the rest, e.g.
  // midpoint('49', '5') -> '4' + midpoint('9', null) -> '495'.
  return BASE_62_DIGITS[digitA] + midpoint(a.slice(1), null);
}

function getIntegerLength(head: string): number {
  if (head >= 'a' && head <= 'z') {
    return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  }
  if (head >= 'A' && head <= 'Z') {
    return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new Error(`invalid sort key head: ${head}`);
}

function validateInteger(int: string) {
  if (int.length !== getIntegerLength(int[0])) {
    throw new Error(`invalid integer part of sort key: ${int}`);
  }
}

function getIntegerPart(key: string): string {
  const integerPartLength = getIntegerLength(key[0]);
  if (integerPartLength > key.length) {
    throw new Error(`invalid sort key: ${key}`);
  }
  return key.slice(0, integerPartLength);
}

function validateSortKey(key: string) {
  if (key === SMALLEST_INTEGER) {
    throw new Error(`invalid sort key: ${key}`);
  }
  // getIntegerPart() throws if the first character is bad or the key is too
  // short.
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === ZERO) {
    throw new Error(`invalid sort key: ${key}`);
  }
}

/** Increments the integer part of a key. Returns null at the largest integer. */
function incrementInteger(x: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(digs[i]) + 1;
    if (d === BASE_62_DIGITS.length) {
      digs[i] = ZERO;
    } else {
      digs[i] = BASE_62_DIGITS[d];
      carry = false;
    }
  }
  if (carry) {
    if (head === 'Z') {
      return 'a' + ZERO;
    }
    if (head === 'z') {
      return null;
    }
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > 'a') {
      digs.push(ZERO);
    } else {
      digs.pop();
    }
    return h + digs.join('');
  }
  return head + digs.join('');
}

/** Decrements the integer part of a key. Returns null at the smallest integer. */
function decrementInteger(x: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(digs[i]) - 1;
    if (d === -1) {
      digs[i] = BASE_62_DIGITS.slice(-1);
    } else {
      digs[i] = BASE_62_DIGITS[d];
      borrow = false;
    }
  }
  if (borrow) {
    if (head === 'a') {
      return 'Z' + BASE_62_DIGITS.slice(-1);
    }
    if (head === 'A') {
      return null;
    }
    const h = String.fromCharCode(head.charCodeAt(0) - 1);
    if (h < 'Z') {
      digs.push(BASE_62_DIGITS.slice(-1));
    } else {
      digs.pop();
    }
    return h + digs.join('');
  }
  return head + digs.join('');
}
