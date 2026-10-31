/**
 * Shared utility functions for handling strings.
 */

/** Hex strings for each byte value. */
const HEX_BYTES = Array.from({length: 256}, (_, i) =>
  i.toString(16).padStart(2, '0')
);

/**
 * Cleans a source string for use in translations. Performs the following:
 * - Removes any leading/trailing whitespace
 * - Removes spaces at the end of any line (including &nbsp;)
 */
export function normalizeStr(str: string): string {
  const lines = str
    .trim()
    .split('\n')
    .map((line) => removeTrailingWhitespace(line));
  return lines.join('\n');
}

function removeTrailingWhitespace(str: string) {
  return str.trimEnd().replace(/&nbsp;$/, '');
}

/**
 * Returns a hash fingerprint for a string.
 *
 * Note that this hash function is meant to be fast and collision-free for use
 * in a hash map, but is not intended for cryptographic purposes. For these
 * reasons `FNV-1a` is used here.
 *
 * NOTE: farmhash-modern was previously tested here, but had issues with
 * cjs/esm imports. A purejs implementation should be used here that can run on
 * the server and in the browser.
 *
 * NOTE: The hashes are stored in the database, so the output must never change.
 * See `fnv1a52Hex()`.
 */
export function hashStr(str: string): string {
  // Avoid hashing empty strings and invalid types.
  if (!str || typeof str !== 'string') {
    throw new Error('input string is invalid');
  }
  return fnv1a52Hex(normalizeStr(str));
}

/**
 * Returns a 52-bit FNV-1a hash as a hex string. Matches `fast1a52hex()` from
 * `fnv-plus`, whose bundled bignum library is too large to ship to the browser.
 * The 64-bit state is held in four 16-bit words because the multiplication
 * overflows a JS number otherwise.
 */
function fnv1a52Hex(str: string): string {
  let v0 = 0x2325;
  let v1 = 0x8422;
  let v2 = 0x9ce4;
  let v3 = 0xcbf2;
  for (let i = 0; i < str.length; i++) {
    v0 ^= str.charCodeAt(i);
    // Multiply by the FNV prime, 2^40 + 2^8 + 0xb3 (435 = 2^8 + 0xb3).
    const t0 = v0 * 435;
    let t1 = v1 * 435;
    let t2 = v2 * 435 + (v0 << 8);
    const t3 = v3 * 435 + (v1 << 8);
    t1 += t0 >>> 16;
    v0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    v1 = t1 & 0xffff;
    v3 = (t3 + (t2 >>> 16)) & 0xffff;
    v2 = t2 & 0xffff;
  }
  return (
    (v3 & 15).toString(16) +
    HEX_BYTES[v2 >> 8] +
    HEX_BYTES[v2 & 255] +
    HEX_BYTES[v1 >> 8] +
    HEX_BYTES[v1 & 255] +
    HEX_BYTES[(v0 >> 8) ^ (v3 >> 12)] +
    HEX_BYTES[(v0 ^ (v3 >> 4)) & 255]
  );
}
