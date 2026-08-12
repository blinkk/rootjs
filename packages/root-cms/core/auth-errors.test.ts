import {describe, expect, it} from 'vitest';
import {getInvalidTokenErrorCode} from './auth-errors.js';

function authError(code: string) {
  return Object.assign(new Error('token rejected'), {code});
}

describe('getInvalidTokenErrorCode', () => {
  it('returns the code for rejected tokens', () => {
    const codes = [
      'auth/argument-error',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/invalid-id-token',
      'auth/session-cookie-expired',
      'auth/session-cookie-revoked',
      'auth/user-disabled',
      'auth/user-not-found',
    ];
    for (const code of codes) {
      expect(getInvalidTokenErrorCode(authError(code))).toBe(code);
    }
  });

  it('returns null for backend failures', () => {
    expect(getInvalidTokenErrorCode(authError('auth/internal-error'))).toBe(
      null
    );
    expect(getInvalidTokenErrorCode(authError('auth/invalid-credential'))).toBe(
      null
    );
  });

  it('returns null for errors without a string code', () => {
    expect(getInvalidTokenErrorCode(new Error('boom'))).toBe(null);
    expect(getInvalidTokenErrorCode({code: 42})).toBe(null);
    expect(getInvalidTokenErrorCode(null)).toBe(null);
    expect(getInvalidTokenErrorCode(undefined)).toBe(null);
  });
});
