/**
 * Shared utility functions for handling strings.
 */

import * as farmhash from 'farmhash-modern';

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
 * Note that this hash function is meant to be fast and for collision avoidance
 * for use in a hash map, but is not intended for cryptographic purposes. For
 * these reasons farmhash is used here.
 *
 * @see https://www.npmjs.com/package/farmhash-modern
 */
export function hashStr(str: string): string {
  return String(farmhash.fingerprint32(normalizeStr(str)));
}
