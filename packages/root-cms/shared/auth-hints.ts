/**
 * Browser-side hints used to speed up the Root CMS sign-in flow.
 *
 * Only non-sensitive metadata is stored here (never tokens or credentials).
 * The hints let the sign-in page tell a first-time visitor apart from someone
 * whose session simply expired, and let the Google account chooser be skipped
 * when the user's account is already known.
 *
 * Every function is a no-op when web storage is unavailable, e.g. during
 * server-side rendering or in a browser with storage disabled.
 */

/** `localStorage` key holding the last successful sign-in. */
const LAST_SIGN_IN_KEY = 'root-cms::last-sign-in';

/** `sessionStorage` key holding the timestamp of the last auto sign-in. */
const AUTO_SIGN_IN_KEY = 'root-cms::auto-sign-in';

/**
 * How long to wait before allowing another automatic sign-in attempt. This
 * guards against a redirect loop between the CMS and the sign-in page in the
 * case where a session is created but immediately rejected (e.g. a cookie the
 * browser refuses to store).
 */
export const AUTO_SIGN_IN_COOLDOWN_MS = 30 * 1000;

/** Metadata about the browser's last successful CMS sign-in. */
export interface LastSignIn {
  /** Email address used for the last successful sign-in. */
  email: string;
  /** Timestamp (in millis) of the last successful sign-in. */
  at: number;
}

function getStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // Storage access throws in some privacy modes.
    return null;
  }
}

/**
 * Returns the last successful sign-in recorded by this browser, or `null` if
 * the user has never signed in here (or the record is unusable).
 */
export function getLastSignIn(): LastSignIn | null {
  const storage = getStorage('local');
  if (!storage) {
    return null;
  }
  try {
    const value = storage.getItem(LAST_SIGN_IN_KEY);
    if (!value) {
      return null;
    }
    const data = JSON.parse(value);
    if (!data || typeof data.email !== 'string' || !data.email) {
      return null;
    }
    return {email: data.email, at: Number(data.at) || 0};
  } catch {
    return null;
  }
}

/** Records a successful sign-in for the given email address. */
export function setLastSignIn(email: string, now = Date.now()) {
  const storage = getStorage('local');
  if (!storage || !email) {
    return;
  }
  try {
    const data: LastSignIn = {email, at: now};
    storage.setItem(LAST_SIGN_IN_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota and permission errors, the hint is best-effort.
  }
}

/**
 * Forgets the last sign-in. Called when the user signs out or when their
 * account is rejected, so the next sign-in shows the account chooser.
 */
export function clearLastSignIn() {
  const storage = getStorage('local');
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(LAST_SIGN_IN_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * Returns true if the sign-in page is allowed to automatically sign the user
 * back in. Returns false while an earlier attempt is still within the cooldown
 * window, which breaks redirect loops between the CMS and the sign-in page.
 */
export function isAutoSignInAllowed(now = Date.now()): boolean {
  const storage = getStorage('session');
  if (!storage) {
    return true;
  }
  try {
    const value = Number(storage.getItem(AUTO_SIGN_IN_KEY));
    if (!value) {
      return true;
    }
    return now - value > AUTO_SIGN_IN_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/** Records that an automatic sign-in attempt is in flight. */
export function markAutoSignInAttempt(now = Date.now()) {
  const storage = getStorage('session');
  if (!storage) {
    return;
  }
  try {
    storage.setItem(AUTO_SIGN_IN_KEY, String(now));
  } catch {
    // Ignore.
  }
}

/**
 * Clears the automatic sign-in marker. Called once the CMS app successfully
 * boots, which proves the session created by the last attempt works.
 */
export function clearAutoSignInAttempt() {
  const storage = getStorage('session');
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(AUTO_SIGN_IN_KEY);
  } catch {
    // Ignore.
  }
}
