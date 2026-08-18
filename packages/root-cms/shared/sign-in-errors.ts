/**
 * User-facing messages for the Firebase Auth errors the CMS sign-in page can
 * run into. Kept out of `signin/` so the strings can be unit tested and reused
 * by anything else that surfaces a sign-in failure.
 */

/**
 * Returned by Identity Platform when the Google identity signing in can't be
 * attached to the account that already exists for that email address.
 *
 * Projects that keep the default "one account per email address" setting link
 * a federated identity to the existing account implicitly at sign-in. That
 * link is rejected when the account already carries a `google.com` provider
 * whose federated id differs from the one signing in, which is what happens
 * after the underlying Google account is deleted and recreated: the address
 * stays the same but Google mints a new subject id for it.
 *
 * The user can't recover from this on their own — the stale provider has to be
 * unlinked from the account record with admin credentials (see
 * `POST /cms/api/users.reset_sign_in`).
 */
export const STALE_PROVIDER_LINK_ERROR_CODE = 'auth/provider-already-linked';

/** True if the error means the account's sign-in link needs to be reset. */
export function isStaleProviderLinkError(code: string): boolean {
  return code === STALE_PROVIDER_LINK_ERROR_CODE;
}

/**
 * Maps a Firebase Auth error to a message that tells the user what to do
 * about it. Unrecognized errors fall back to the error's own message, which is
 * usually only meaningful to a developer but is better than nothing.
 */
export function getSignInErrorMessage(err: unknown): string {
  const code = (err as {code?: unknown} | null)?.code;
  switch (code) {
    case STALE_PROVIDER_LINK_ERROR_CODE:
      return (
        'Your Google account is no longer linked to the sign-in record for ' +
        'this project. Ask a CMS admin to reset your sign-in from Settings, ' +
        'then try again.'
      );
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/popup-blocked':
      return (
        'Your browser blocked the sign-in popup. Allow popups for this site ' +
        'and try again.'
      );
    case 'auth/unauthorized-domain':
      return (
        'This domain is not authorized for sign-in. A developer needs to add ' +
        'it to the authorized domains of the Firebase project.'
      );
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact a CMS admin.';
    default:
      break;
  }
  const message = (err as {message?: unknown} | null)?.message;
  return `Sign in failed: ${
    typeof message === 'string' && message ? message : 'unknown error'
  }`;
}
