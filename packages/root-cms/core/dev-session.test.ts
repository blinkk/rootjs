import {afterEach, describe, expect, test} from 'vitest';
import {
  decodeDevAuthCookie,
  encodeDevAuthCookie,
  isDevSharedAuthEnabled,
} from './dev-session.js';

const SECRET = 'test-secret';

describe('dev-session', () => {
  const nodeEnv = process.env.NODE_ENV;
  const flag = process.env.ROOT_CMS_DEV_SHARED_AUTH;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    if (flag === undefined) {
      delete process.env.ROOT_CMS_DEV_SHARED_AUTH;
    } else {
      process.env.ROOT_CMS_DEV_SHARED_AUTH = flag;
    }
  });

  test('round-trips a token', () => {
    const value = encodeDevAuthCookie('token123', SECRET, 1000);
    expect(decodeDevAuthCookie(value, SECRET, 2000)).toBe('token123');
  });

  test('rejects a tampered payload', () => {
    const value = encodeDevAuthCookie('token123', SECRET, 1000);
    const [encoded, signature] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify({token: 'evil', exp: 9e12}),
      'utf-8'
    ).toString('base64url');
    expect(encoded).not.toBe(forged);
    expect(decodeDevAuthCookie(`${forged}.${signature}`, SECRET, 2000)).toBe(
      null
    );
  });

  test('rejects a value signed with a different secret', () => {
    const value = encodeDevAuthCookie('token123', 'other-secret', 1000);
    expect(decodeDevAuthCookie(value, SECRET, 2000)).toBe(null);
  });

  test('rejects an expired value', () => {
    const value = encodeDevAuthCookie('token123', SECRET, 1000);
    expect(decodeDevAuthCookie(value, SECRET, 9e12)).toBe(null);
  });

  test('rejects a malformed value', () => {
    expect(decodeDevAuthCookie('', SECRET)).toBe(null);
    expect(decodeDevAuthCookie('nodot', SECRET)).toBe(null);
    expect(decodeDevAuthCookie('.sig', SECRET)).toBe(null);
  });

  test('is only enabled during development', () => {
    delete process.env.ROOT_CMS_DEV_SHARED_AUTH;
    process.env.NODE_ENV = 'production';
    expect(isDevSharedAuthEnabled()).toBe(false);
    process.env.NODE_ENV = 'development';
    expect(isDevSharedAuthEnabled()).toBe(true);
    process.env.ROOT_CMS_DEV_SHARED_AUTH = '0';
    expect(isDevSharedAuthEnabled()).toBe(false);
    process.env.ROOT_CMS_DEV_SHARED_AUTH = 'false';
    expect(isDevSharedAuthEnabled()).toBe(false);
    process.env.ROOT_CMS_DEV_SHARED_AUTH = '1';
    expect(isDevSharedAuthEnabled()).toBe(true);
  });
});
