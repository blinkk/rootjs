import type {User} from 'firebase/auth';
import {Firestore, doc, serverTimestamp, setDoc} from 'firebase/firestore';

/** Sends the user to the sign-in page, returning here afterwards. */
export function loginRedirect() {
  let originalUrl = window.location.pathname;
  if (window.location.search) {
    originalUrl = `${originalUrl}?${window.location.search}`;
  }
  const params = new URLSearchParams({continue: originalUrl});
  window.location.replace(`/cms/login?${params.toString()}`);
}

/** The last ID token successfully exchanged for a session cookie. */
let lastSyncedIdToken = '';

/**
 * Exchanges the user's current Firebase ID token for a fresh CMS session
 * cookie. No-ops when the session was already updated with the same token.
 */
export async function updateSession(user: User) {
  const idToken = await user.getIdToken();
  if (idToken === lastSyncedIdToken) {
    return;
  }
  const res = await fetch('/cms/login', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({idToken}),
  });
  if (res.status !== 200) {
    console.error('login failed');
    console.log(res);
    return;
  }
  const data = await res.json();
  if (!data.success) {
    console.error('login failed');
    console.log(res);
    return;
  }
  lastSyncedIdToken = idToken;
}

/**
 * Persists the signed-in user's profile (display name, photo URL) to the DB
 * so other users can render their avatar/name without each client having to
 * re-fetch from the auth provider. Stored at
 * `Projects/<projectId>/UserProfiles/<email>` keyed by email since emails are
 * the canonical identifier used throughout the CMS.
 */
export async function saveUserProfile(user: User, db: Firestore) {
  if (!user.email) {
    return;
  }
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const profileRef = doc(db, 'Projects', projectId, 'UserProfiles', user.email);
  try {
    await setDoc(
      profileRef,
      {
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        uid: user.uid,
        lastSignedInAt: serverTimestamp(),
      },
      {merge: true}
    );
  } catch (err) {
    console.error('failed to save user profile:', err);
  }
}
