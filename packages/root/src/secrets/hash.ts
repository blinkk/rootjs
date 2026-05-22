import crypto from 'node:crypto';

/**
 * Returns the lowercase hex sha256 digest of a UTF-8 string. Used to detect
 * local edits to managed `.env` values without storing the plaintext value in
 * the on-disk sync state.
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
