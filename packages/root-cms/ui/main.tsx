import './styles/tailwind.out.css';
import './styles/global.css';
import './styles/mantine.css';
import './styles/theme.css';

import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {initializeFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import {render} from 'preact';
import {clearAutoSignInAttempt, setLastSignIn} from '../shared/auth-hints.js';
import {App} from './app/App.js';
import {installGlobalErrorHandlers} from './app/global-errors.js';
import {installNavigationGuards} from './app/navigation-guard.js';
import {loginRedirect, saveUserProfile, updateSession} from './app/session.js';

function registerDevServerRedirectShortcut() {
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    const isShortcutPressed =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'd';
    if (!isShortcutPressed) {
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return;
    }

    event.preventDefault();
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`http://localhost:4007${path}`);
  });
}

registerDevServerRedirectShortcut();

// Surface uncaught errors and unhandled rejections to the user instead of
// letting them disappear into the devtools console.
installGlobalErrorHandlers();

// Install the unsaved-changes navigation guards before the app renders so
// the guard listeners run ahead of preact-iso's click/popstate listeners.
installNavigationGuards();

const root = document.getElementById('root')!;

/**
 * Max time to wait for Firebase Auth to report the auth state before showing
 * an error screen. Without a deadline, a stalled auth request would leave the
 * "Loading..." screen up indefinitely with no way to tell what went wrong.
 */
const AUTH_STATE_TIMEOUT_MS = 15 * 1000;

function getStartupErrorMessage(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/invalid-api-key') {
    return 'Firebase API key is invalid.';
  }
  return err?.message || 'An unknown startup error occurred.';
}

function showStartupError(err: any) {
  console.error(err);
  root.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'bootstrap bootstrap--error';

  const title = document.createElement('h1');
  title.className = 'bootstrap__error-title';
  title.textContent = 'Something went wrong';

  const message = document.createElement('p');
  message.className = 'bootstrap__error-message';
  message.textContent = getStartupErrorMessage(err);

  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.className = 'bootstrap__error-button';
  reloadButton.textContent = 'Reload page';
  reloadButton.addEventListener('click', () => window.location.reload());

  container.append(title, message, reloadButton);
  root.append(container);
}

try {
  const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
  const databaseId = window.__ROOT_CTX.firebaseConfig.databaseId || '(default)';
  // const db = getFirestore(app);
  // NOTE(stevenle): the firestore web channel rpc sometimes has issues in
  // collections with a large number of docs.
  //
  // We previously forced long polling (`experimentalForceLongPolling: true`)
  // unconditionally as a workaround, but that transport can get into a stuck
  // state where the `channel?gsessionid=...` long-poll session stalls and never
  // completes, leaving requests like getDocs() pending forever (the CMS hangs
  // on a loading spinner until a hard reload). Use auto-detect instead so the
  // SDK prefers the more reliable WebChannel/fetch-stream transport and only
  // falls back to long polling on networks that actually require it.
  const db = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
    } as any,
    databaseId
  );
  const auth = getAuth(app);
  const storage = getStorage(app);
  // Watchdog: if the auth state never arrives (e.g. a stalled network
  // request), replace the loading screen with an error screen instead of
  // spinning forever. If the auth state eventually arrives after the deadline,
  // the app still renders over the error screen and recovers.
  const authWatchdog = window.setTimeout(() => {
    showStartupError(
      new Error(
        'Timed out waiting for Firebase Authentication to respond. Check your network connection and reload the page.'
      )
    );
  }, AUTH_STATE_TIMEOUT_MS);
  // Keep the server session in sync with the Firebase ID token. The listener
  // fires with the current token and again whenever the SDK refreshes it
  // (roughly hourly), which pushes out the session cookie's expiration so
  // long-lived tabs don't get bounced to the sign-in page mid-edit.
  auth.onIdTokenChanged((user) => {
    if (!user) {
      return;
    }
    updateSession(user).catch((err) => {
      console.error('failed to update login session:', err);
    });
  });
  auth.onAuthStateChanged(
    (user) => {
      window.clearTimeout(authWatchdog);
      if (!user) {
        loginRedirect();
        return;
      }
      window.firebase = {app, auth, db, storage, user};
      root.innerHTML = '';
      render(<App />, root);

      // The app booted, which proves the session cookie works. Remember the
      // account so the sign-in page can restore this session automatically the
      // next time it expires.
      clearAutoSignInAttempt();
      if (user.email) {
        setLastSignIn(user.email);
      }
      saveUserProfile(user, db);
    },
    (err) => {
      window.clearTimeout(authWatchdog);
      showStartupError(err);
    }
  );
} catch (err) {
  showStartupError(err);
}
