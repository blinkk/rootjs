// @vitest-environment node
import {describe, expect, test} from 'vitest';
import {
  DEFAULT_ITERATIONS,
  hashPassword,
  isPasswordHash,
  verifyPassword,
} from './password.js';

// A low iteration count keeps the tests fast; the algorithm is the same.
const ITERATIONS = 1000;

describe('hashPassword', () => {
  test('stores the algorithm, iterations, salt and hash', async () => {
    const stored = await hashPassword('hunter2', {iterations: ITERATIONS});
    expect(stored.algorithm).toBe('pbkdf2-sha256');
    expect(stored.iterations).toBe(ITERATIONS);
    expect(stored.salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(stored.hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(stored.hash).not.toContain('hunter2');
  });

  test('uses the default iteration count when none is given', async () => {
    const stored = await hashPassword('hunter2');
    expect(stored.iterations).toBe(DEFAULT_ITERATIONS);
  });

  test('generates a different salt and hash for the same password', async () => {
    const a = await hashPassword('hunter2', {iterations: ITERATIONS});
    const b = await hashPassword('hunter2', {iterations: ITERATIONS});
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  test('rejects an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  test('rejects invalid iteration counts', async () => {
    await expect(hashPassword('x', {iterations: 0})).rejects.toThrow();
    await expect(hashPassword('x', {iterations: 1.5})).rejects.toThrow();
  });
});

describe('verifyPassword', () => {
  test('matches the original password', async () => {
    const stored = await hashPassword('hunter2', {iterations: ITERATIONS});
    expect(await verifyPassword(stored, 'hunter2')).toBe(true);
  });

  test('rejects a different password', async () => {
    const stored = await hashPassword('hunter2', {iterations: ITERATIONS});
    expect(await verifyPassword(stored, 'hunter3')).toBe(false);
    expect(await verifyPassword(stored, '')).toBe(false);
    expect(await verifyPassword(stored, 'Hunter2')).toBe(false);
  });

  test('supports unicode passwords', async () => {
    const stored = await hashPassword('pässwörd 🔐', {iterations: ITERATIONS});
    expect(await verifyPassword(stored, 'pässwörd 🔐')).toBe(true);
    expect(await verifyPassword(stored, 'password 🔐')).toBe(false);
  });

  test('verifies a known vector', async () => {
    // Derived with node's `crypto.pbkdf2Sync('hunter2', salt, 1000, 32, 'sha256')`.
    const stored = {
      algorithm: 'pbkdf2-sha256' as const,
      iterations: ITERATIONS,
      salt: 'AAECAwQFBgcICQoLDA0ODw==',
      hash: 'KNOWN_VECTOR',
    };
    const {pbkdf2Sync} = await import('node:crypto');
    stored.hash = pbkdf2Sync(
      'hunter2',
      Buffer.from(stored.salt, 'base64'),
      ITERATIONS,
      32,
      'sha256'
    ).toString('base64');
    expect(await verifyPassword(stored, 'hunter2')).toBe(true);
    expect(await verifyPassword(stored, 'hunter3')).toBe(false);
  });

  test('returns false for missing or malformed stored values', async () => {
    expect(await verifyPassword(null, 'hunter2')).toBe(false);
    expect(await verifyPassword(undefined, 'hunter2')).toBe(false);
    expect(await verifyPassword({} as any, 'hunter2')).toBe(false);
    expect(await verifyPassword('hunter2' as any, 'hunter2')).toBe(false);
    expect(
      await verifyPassword(
        {algorithm: 'md5', iterations: 1, salt: 'AA==', hash: 'AA=='} as any,
        'hunter2'
      )
    ).toBe(false);
    expect(
      await verifyPassword(
        {algorithm: 'pbkdf2-sha256', iterations: 0, salt: 'AA==', hash: 'AA=='},
        'hunter2'
      )
    ).toBe(false);
    expect(
      await verifyPassword(
        {algorithm: 'pbkdf2-sha256', iterations: 1, salt: '', hash: ''},
        'hunter2'
      )
    ).toBe(false);
    expect(
      await verifyPassword(
        {algorithm: 'pbkdf2-sha256', iterations: 1, salt: '***', hash: '***'},
        'hunter2'
      )
    ).toBe(false);
  });

  test('never accepts a non-string candidate', async () => {
    const stored = await hashPassword('hunter2', {iterations: ITERATIONS});
    expect(await verifyPassword(stored, undefined as any)).toBe(false);
    expect(await verifyPassword(stored, 123 as any)).toBe(false);
  });
});

describe('isPasswordHash', () => {
  test('accepts a well-formed value', async () => {
    const stored = await hashPassword('x', {iterations: ITERATIONS});
    expect(isPasswordHash(stored)).toBe(true);
  });

  test('rejects other values', () => {
    expect(isPasswordHash(null)).toBe(false);
    expect(isPasswordHash('x')).toBe(false);
    expect(isPasswordHash([])).toBe(false);
    expect(isPasswordHash({algorithm: 'pbkdf2-sha256'})).toBe(false);
    expect(
      isPasswordHash({
        algorithm: 'pbkdf2-sha256',
        iterations: '1',
        salt: 'a',
        hash: 'b',
      })
    ).toBe(false);
  });
});
