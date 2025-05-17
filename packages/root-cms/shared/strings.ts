/**
 * Shared utility functions for handling strings.
 */

import fnv from 'fnv-plus';

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
 * @see https://www.npmjs.com/package/fnv-plus
 */
export function hashStr(str: string): string {
  // Avoid hashing empty strings and invalid types.
  if (!str || typeof str !== 'string') {
    throw new Error('input string is invalid');
  }
  return fnv.fast1a52hex(normalizeStr(str));
}
