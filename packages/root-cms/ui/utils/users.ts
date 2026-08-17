import {doc, getDoc} from 'firebase/firestore';

/**
 * Returns a list of users that can edit, e.g. users with role EDITOR or ADMIN.
 */
export async function getAllEditors(): Promise<string[]> {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const docRef = doc(db, 'Projects', projectId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists) {
    return [];
  }
  const data: any = snapshot.data() || {};
  const roles: Record<string, string> = data.roles || {};
  const editors: string[] = [];
  Object.entries(roles).forEach(([email, role]) => {
    if (role === 'ADMIN' || role === 'EDITOR' || role === 'CONTRIBUTOR') {
      editors.push(email);
    }
  });
  return editors;
}

/** Whether an email has a Google sign-in link that could be reset. */
export interface SignInStatus {
  /** True if a Firebase Auth account exists for the email. */
  exists: boolean;
  /** True if that account has a Google provider linked to it. */
  hasGoogleLink: boolean;
}

/**
 * Looks up which of the given emails have a Google sign-in link, so that the
 * "reset sign-in" action can be hidden for the users it can't help. Requires
 * the ADMIN role. Results are keyed by lower-cased email.
 */
export async function getSignInStatuses(
  emails: string[]
): Promise<Map<string, SignInStatus>> {
  const statuses = new Map<string, SignInStatus>();
  if (emails.length === 0) {
    return statuses;
  }
  const res = await fetch('/cms/api/users.sign_in_status', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({emails: emails}),
  });
  if (res.status !== 200) {
    throw new Error(`failed to fetch sign-in statuses (${res.status})`);
  }
  const data = await res.json();
  Object.entries(data.users || {}).forEach(([email, status]) => {
    statuses.set(email.toLowerCase(), status as SignInStatus);
  });
  return statuses;
}

/**
 * Resets a user's Google sign-in link.
 *
 * Unlinks the Google provider from the user's Firebase Auth record so that
 * their next sign-in attaches the identity they're signing in with. Used to
 * recover accounts that fail sign-in with `auth/provider-already-linked`,
 * which happens when the Google account behind an email address is recreated
 * and Identity Platform refuses to attach the new federated id to the record
 * that already holds the address.
 *
 * Requires the ADMIN role. Resolves to `true` if a stale link was removed, or
 * `false` if the account had no Google provider to remove (in which case
 * sign-in is failing for some other reason).
 */
export async function resetUserSignIn(email: string): Promise<boolean> {
  const res = await fetch('/cms/api/users.reset_sign_in', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email: email}),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch (err) {
    console.error(err);
  }
  if (res.status !== 200 || !data.success) {
    throw new Error(data.error || `failed to reset sign-in for ${email}`);
  }
  return !!data.reset;
}
