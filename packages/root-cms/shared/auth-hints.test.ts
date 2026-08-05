import {beforeEach, describe, expect, test} from 'vitest';
import {
  AUTO_SIGN_IN_COOLDOWN_MS,
  clearAutoSignInAttempt,
  clearLastSignIn,
  getLastSignIn,
  isAutoSignInAllowed,
  markAutoSignInAttempt,
  setLastSignIn,
} from './auth-hints.js';

describe('auth-hints', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test('remembers the last sign-in', () => {
    expect(getLastSignIn()).toBe(null);
    setLastSignIn('user@example.com', 1000);
    expect(getLastSignIn()).toEqual({email: 'user@example.com', at: 1000});
    clearLastSignIn();
    expect(getLastSignIn()).toBe(null);
  });

  test('ignores an unusable last sign-in record', () => {
    window.localStorage.setItem('root-cms::last-sign-in', 'not json');
    expect(getLastSignIn()).toBe(null);
    window.localStorage.setItem('root-cms::last-sign-in', '{"at": 1000}');
    expect(getLastSignIn()).toBe(null);
  });

  test('ignores an empty email', () => {
    setLastSignIn('', 1000);
    expect(getLastSignIn()).toBe(null);
  });

  test('allows an automatic sign-in by default', () => {
    expect(isAutoSignInAllowed(1000)).toBe(true);
  });

  test('blocks repeat automatic sign-ins within the cooldown', () => {
    markAutoSignInAttempt(1000);
    expect(isAutoSignInAllowed(1000)).toBe(false);
    expect(isAutoSignInAllowed(1000 + AUTO_SIGN_IN_COOLDOWN_MS)).toBe(false);
    expect(isAutoSignInAllowed(1001 + AUTO_SIGN_IN_COOLDOWN_MS)).toBe(true);
  });

  test('clearing the attempt allows an automatic sign-in again', () => {
    markAutoSignInAttempt(1000);
    expect(isAutoSignInAllowed(1000)).toBe(false);
    clearAutoSignInAttempt();
    expect(isAutoSignInAllowed(1000)).toBe(true);
  });
});
