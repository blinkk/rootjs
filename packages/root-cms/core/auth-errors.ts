/**
 * Firebase Auth error codes that mean "the caller sent a token we can't
 * accept", as opposed to a backend failure. `verifyIdToken()` and
 * `verifySessionCookie()` reject with these for malformed, expired, or
 * revoked tokens, all of which are ordinary sign-in failures.
 */
const INVALID_TOKEN_ERROR_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/**
 * Returns the Firebase Auth error code if the error means the token itself was
 * rejected, rather than the verification failing for an infrastructure reason
 * (network, credentials, etc.). Callers use this to log expected sign-in
 * failures without reporting them as server errors.
 */
export function getInvalidTokenErrorCode(err: unknown): string | null {
  const code = (err as {code?: unknown} | null)?.code;
  if (typeof code === 'string' && INVALID_TOKEN_ERROR_CODES.has(code)) {
    return code;
  }
  return null;
}
