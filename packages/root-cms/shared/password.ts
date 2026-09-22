/**
 * Isomorphic password hashing helpers used by the `password` field type.
 *
 * Passwords are never stored in plain text. The CMS UI hashes the password in
 * the browser before it is written to the draft doc, and server code verifies
 * a candidate password against the stored hash using `verifyPassword()`.
 *
 * Only Web Crypto (`globalThis.crypto.subtle`) is used, so the same code runs
 * in browsers and in Node without any node-only imports.
 */

/** The hashing algorithms supported by {@link hashPassword}. */
export type PasswordHashAlgorithm = 'pbkdf2-sha256';

/**
 * The value stored in the db for a `password` field. The salt and the derived
 * hash are stored base64-encoded alongside the parameters used to compute
 * them, so the algorithm or its cost can change without invalidating existing
 * hashes.
 */
export interface PasswordHash {
  /** The key derivation algorithm used, e.g. `pbkdf2-sha256`. */
  algorithm: PasswordHashAlgorithm;
  /** The number of PBKDF2 iterations used to derive the hash. */
  iterations: number;
  /** The random salt used to derive the hash, base64-encoded. */
  salt: string;
  /** The derived hash, base64-encoded. */
  hash: string;
}

export interface HashPasswordOptions {
  /**
   * The number of PBKDF2 iterations. Defaults to {@link DEFAULT_ITERATIONS}.
   * Higher values are slower to compute and slower to brute force.
   */
  iterations?: number;
}

/**
 * The default number of PBKDF2-HMAC-SHA256 iterations, following the OWASP
 * password storage recommendation.
 */
export const DEFAULT_ITERATIONS = 600_000;

/** The salt length in bytes. */
const SALT_BYTES = 16;

/** The derived hash length in bytes (256 bits). */
const HASH_BYTES = 32;

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is not available in this environment');
  }
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
    keyMaterial,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

/**
 * Compares two byte arrays in constant time so that the comparison does not
 * leak how many leading bytes matched.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Returns whether a value has the shape of a {@link PasswordHash}.
 */
export function isPasswordHash(value: unknown): value is PasswordHash {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.algorithm === 'string' &&
    typeof obj.iterations === 'number' &&
    typeof obj.salt === 'string' &&
    typeof obj.hash === 'string'
  );
}

/**
 * Hashes a password with a freshly generated random salt.
 *
 * ```ts
 * const stored = await hashPassword('hunter2');
 * // => {algorithm: 'pbkdf2-sha256', iterations: 600000, salt: '...', hash: '...'}
 * ```
 */
export async function hashPassword(
  password: string,
  options?: HashPasswordOptions
): Promise<PasswordHash> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  const iterations = options?.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('iterations must be a positive integer');
  }
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  const hash = await pbkdf2Sha256(password, salt, iterations);
  return {
    algorithm: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
  };
}

/**
 * Verifies a candidate password against a stored {@link PasswordHash}.
 *
 * Returns `false` (never throws) when the stored value is missing or
 * malformed, so callers can pass a field value straight from a doc.
 *
 * ```ts
 * const ok = await verifyPassword(doc.fields.password, req.body.password);
 * ```
 */
export async function verifyPassword(
  stored: PasswordHash | null | undefined,
  password: string
): Promise<boolean> {
  if (!isPasswordHash(stored) || typeof password !== 'string') {
    return false;
  }
  if (stored.algorithm !== 'pbkdf2-sha256') {
    return false;
  }
  if (!Number.isInteger(stored.iterations) || stored.iterations < 1) {
    return false;
  }
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(stored.salt);
    expected = fromBase64(stored.hash);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const actual = await pbkdf2Sha256(password, salt, stored.iterations);
  return timingSafeEqual(actual, expected);
}
