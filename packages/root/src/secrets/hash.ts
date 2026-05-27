import crypto from 'node:crypto';

/**
 * Returns a random salt (hex), generated once per local sync-state file. Storing
 * a salt makes {@link hashValue} digests non-precomputable, so a leaked state
 * file can't be reversed against a rainbow table of bare sha256 hashes.
 */
export function randomSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Returns the salted sha256 (hex) of a value. Used to detect local edits to a
 * managed `.env` value without storing the plaintext in the sync state.
 */
export function hashValue(salt: string, value: string): string {
  return crypto
    .createHash('sha256')
    .update(salt)
    .update('\0')
    .update(value, 'utf8')
    .digest('hex');
}
