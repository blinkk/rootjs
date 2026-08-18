import {describe, expect, it} from 'vitest';
import {
  STALE_PROVIDER_LINK_ERROR_CODE,
  getSignInErrorMessage,
  isStaleProviderLinkError,
} from './sign-in-errors.js';

function authError(code: string, message = 'firebase error') {
  return Object.assign(new Error(message), {code});
}

describe('isStaleProviderLinkError', () => {
  it('matches the stale provider link code', () => {
    expect(isStaleProviderLinkError(STALE_PROVIDER_LINK_ERROR_CODE)).toBe(true);
  });

  it('ignores other codes', () => {
    expect(isStaleProviderLinkError('auth/credential-already-in-use')).toBe(
      false
    );
    expect(isStaleProviderLinkError('')).toBe(false);
  });
});

describe('getSignInErrorMessage', () => {
  it('explains how to recover from a stale provider link', () => {
    const msg = getSignInErrorMessage(
      authError(STALE_PROVIDER_LINK_ERROR_CODE)
    );
    expect(msg).toContain('no longer linked');
    expect(msg).toContain('reset your sign-in');
    expect(msg).not.toContain('firebase error');
  });

  it('returns a message for other known codes', () => {
    expect(
      getSignInErrorMessage(authError('auth/network-request-failed'))
    ).toBe('Network error. Please check your connection and try again.');
    expect(getSignInErrorMessage(authError('auth/popup-blocked'))).toContain(
      'blocked the sign-in popup'
    );
    expect(getSignInErrorMessage(authError('auth/user-disabled'))).toContain(
      'disabled'
    );
  });

  it('falls back to the error message', () => {
    expect(
      getSignInErrorMessage(authError('auth/internal-error', 'boom'))
    ).toBe('Sign in failed: boom');
    expect(getSignInErrorMessage(new Error('boom'))).toBe(
      'Sign in failed: boom'
    );
  });

  it('handles errors without a usable message', () => {
    expect(getSignInErrorMessage({code: 'auth/internal-error'})).toBe(
      'Sign in failed: unknown error'
    );
    expect(getSignInErrorMessage(null)).toBe('Sign in failed: unknown error');
    expect(getSignInErrorMessage(undefined)).toBe(
      'Sign in failed: unknown error'
    );
  });
});
