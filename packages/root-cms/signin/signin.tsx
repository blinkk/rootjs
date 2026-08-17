import {FirebaseApp, initializeApp} from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {Auth, getAuth, onAuthStateChanged} from 'firebase/auth';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {
  clearAutoSignInAttempt,
  clearLastSignIn,
  getLastSignIn,
  isAutoSignInAllowed,
  markAutoSignInAttempt,
  setLastSignIn,
} from '../shared/auth-hints.js';
import {getSignInErrorMessage} from '../shared/sign-in-errors.js';
import './styles/global.css';
import './styles/signin.css';

type MaybeString = string | false | null | undefined;

function joinClassNames(...classNames: MaybeString[]) {
  return classNames.filter((c) => !!c).join(' ') || undefined;
}

declare global {
  interface Window {
    __ROOT_CTX: {
      name: string;
      firebaseConfig: Record<string, string>;
      warning: string;
    };
    firebase: {
      app: FirebaseApp;
      auth: Auth;
    };
  }
}

/**
 * Max time to wait for Firebase Auth to report whether a previous session is
 * still persisted in this browser. Past the deadline the sign-in button is
 * shown so the user is never stuck watching a spinner.
 */
const RESTORE_TIMEOUT_MS = 8 * 1000;

/** Tracks the current phase of the sign-in flow. */
type SignInStatus =
  /** Checking whether the user is already signed in with Firebase. */
  | 'restoring'
  /** No sign-in in progress; the button is clickable. */
  | 'idle'
  /** The Google auth popup is open and we're waiting for the user. */
  | 'popup'
  /** A token was obtained; we're validating it with the server. */
  | 'verifying'
  /** Server validated the token; navigating to the app. */
  | 'redirecting';

/**
 * Returns the phase the sign-in page should start in. Browsers that have
 * signed in before start in "restoring" so returning users see progress
 * instead of a button they'd have to click; everyone else goes straight to the
 * sign-in button.
 */
function getInitialStatus(): SignInStatus {
  if (signedOutOfCms()) {
    return 'idle';
  }
  if (getLastSignIn() && isAutoSignInAllowed()) {
    return 'restoring';
  }
  return 'idle';
}

/** Result of exchanging a Firebase ID token for a CMS session cookie. */
interface SessionResult {
  success: boolean;
  /** User-facing error message, set when `success` is false. */
  error?: string;
  /** True when the server rejected the account itself (vs. a transient error). */
  rejected?: boolean;
}

function SignIn() {
  const [errorMsg, setErrorMsg] = useState('');
  const [status, setStatus] = useState<SignInStatus>(getInitialStatus);
  const title = window.__ROOT_CTX.name;
  const warning = window.__ROOT_CTX.warning;

  // Tracks the active sign-in attempt. Bumped by both the automatic and the
  // manual flows so that a stale attempt can't overwrite newer state.
  const attemptRef = useRef(0);

  function onError(msg: string) {
    setErrorMsg(msg);
  }

  // Attempt to sign the user back in without any interaction. The Firebase SDK
  // persists the signed-in user (and its refresh token) in browser storage, so
  // an expired CMS session cookie can usually be re-minted silently.
  useEffect(() => {
    if (signedOutOfCms()) {
      // The user explicitly signed out. Drop the persisted Firebase user so
      // they aren't immediately signed back in.
      signOut(window.firebase.auth).catch((err) => console.error(err));
      return;
    }
    if (!isAutoSignInAllowed()) {
      // A previous automatic attempt didn't stick. Fall back to the button
      // instead of bouncing between the CMS and this page.
      setStatus('idle');
      onError('Your session could not be restored. Please sign in again.');
      return;
    }

    const attempt = ++attemptRef.current;
    let done = false;
    const timeoutId = window.setTimeout(() => {
      if (!done && attemptRef.current === attempt) {
        done = true;
        setStatus('idle');
      }
    }, RESTORE_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(
      window.firebase.auth,
      async (user) => {
        if (done || attemptRef.current !== attempt) {
          return;
        }
        done = true;
        window.clearTimeout(timeoutId);
        if (!user) {
          // Nothing persisted, the user has to sign in manually.
          setStatus('idle');
          return;
        }
        setStatus('verifying');
        const result = await createSession(user);
        if (attemptRef.current !== attempt) {
          return;
        }
        if (result.success) {
          setStatus('redirecting');
          loginSuccessRedirect();
          return;
        }
        if (result.rejected) {
          // The account is no longer allowed into this project, forget it so
          // the next manual sign-in offers the account chooser.
          clearLastSignIn();
        }
        onError(result.error || 'Sign in failed.');
        setStatus('idle');
      },
      (err) => {
        if (done || attemptRef.current !== attempt) {
          return;
        }
        done = true;
        window.clearTimeout(timeoutId);
        console.error(err);
        setStatus('idle');
      }
    );

    return () => {
      done = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  return (
    <div className="signin">
      <div className="signin__headline">
        {title && <h1 className="signin__headline__title">{title}</h1>}
        <p className="signin__headline__body">
          {title ? `Sign in to continue to ${title}` : 'Sign in to continue'}
        </p>
      </div>
      {warning && <div className="signin__warning">{warning}</div>}
      {status === 'restoring' ? (
        <SignIn.Restoring />
      ) : (
        <SignIn.Button
          status={status}
          setStatus={setStatus}
          attemptRef={attemptRef}
          onError={onError}
        />
      )}
      {errorMsg && <p className="signin__error">{errorMsg}</p>}
    </div>
  );
}

SignIn.Restoring = () => {
  const lastSignIn = getLastSignIn();
  return (
    <div className="signin__restoring">
      <div className="signin__restoring__icon">
        <SignIn.Spinner />
      </div>
      <div className="signin__restoring__label">
        {lastSignIn
          ? `Signing you back in as ${lastSignIn.email}…`
          : 'Signing you back in…'}
      </div>
    </div>
  );
};

interface ButtonProps {
  status: SignInStatus;
  setStatus: (status: SignInStatus) => void;
  attemptRef: {current: number};
  onError: (msg: string) => void;
}

SignIn.Button = (props: ButtonProps) => {
  const {status, setStatus, attemptRef} = props;
  const popupRef = useRef<Window | null>(null);
  const lastSignIn = getLastSignIn();

  // Poll for popup closure while waiting for the Google auth popup.
  useEffect(() => {
    if (status !== 'popup') return;
    const id = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        setStatus('idle');
      }
    }, 200);
    return () => clearInterval(id);
  }, [status]);

  async function signIn(options?: {selectAccount?: boolean}) {
    if (status !== 'idle') return;
    props.onError('');
    const attempt = ++attemptRef.current;
    setStatus('popup');

    /** Only update state if this is still the active attempt. */
    function updateStatus(s: SignInStatus) {
      if (attemptRef.current === attempt) {
        setStatus(s);
      }
    }
    function updateError(msg: string) {
      if (attemptRef.current === attempt) {
        props.onError(msg);
      }
    }

    let result;
    // Intercept window.open for a single call to capture the popup reference.
    // Restored immediately inside the interceptor so it never stacks.
    const origOpen = window.open;
    window.open = function (...args: Parameters<typeof window.open>) {
      window.open = origOpen;
      const w = origOpen.apply(this, args);
      popupRef.current = w;
      return w;
    };
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      // Pre-select the account used the last time this browser signed in so
      // returning users skip the account chooser entirely.
      if (options?.selectAccount) {
        provider.setCustomParameters({prompt: 'select_account'});
      } else if (lastSignIn?.email) {
        provider.setCustomParameters({login_hint: lastSignIn.email});
      }
      result = await signInWithPopup(window.firebase.auth, provider);
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        // User deliberately closed the popup, reset silently.
        updateStatus('idle');
        return;
      }
      console.error(err);
      updateError(getSignInErrorMessage(err));
      updateStatus('idle');
      return;
    }

    updateStatus('verifying');

    const sessionResult = await createSession(result.user);
    if (sessionResult.success) {
      updateStatus('redirecting');
      loginSuccessRedirect();
      return;
    }
    if (sessionResult.rejected) {
      clearLastSignIn();
    }
    updateError(sessionResult.error || 'Sign in failed.');
    updateStatus('idle');
  }

  const busy = status !== 'idle';
  const label =
    status === 'popup'
      ? 'Signing in…'
      : status === 'verifying'
        ? 'Authorizing…'
        : status === 'redirecting'
          ? 'Redirecting…'
          : 'Sign in with Google';

  return (
    <div className="signin__actions">
      <button
        className={joinClassNames(
          'signin__button',
          busy && 'signin__button--busy'
        )}
        onClick={() => signIn()}
        disabled={busy}
      >
        <div className="signin__button__icon">
          {busy ? <SignIn.Spinner /> : <SignIn.GLogo />}
        </div>
        <div className="signin__button__label">{label}</div>
      </button>
      {lastSignIn?.email && !busy && (
        <button
          className="signin__switch-account"
          onClick={() => {
            clearLastSignIn();
            signIn({selectAccount: true});
          }}
        >
          Use a different account
        </button>
      )}
    </div>
  );
};

SignIn.Spinner = () => (
  <svg
    className="signin__spinner"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-dasharray="50 14"
      stroke-linecap="round"
    />
  </svg>
);

SignIn.GLogo = () => (
  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <g>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      ></path>
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      ></path>
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      ></path>
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      ></path>
      <path fill="none" d="M0 0h48v48H0z"></path>
    </g>
  </svg>
);

async function getResData(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch (err) {
    console.error(err);
  }
  return {};
}

/**
 * Exchanges a signed-in Firebase user's ID token for a Root CMS session
 * cookie. Shared by the automatic and the manual sign-in flows.
 */
async function createSession(user: User): Promise<SessionResult> {
  try {
    const idToken = await user.getIdToken();
    // Record the attempt before the session is created so that a session which
    // the browser or server refuses to honor can't cause a redirect loop
    // between the CMS and this page. Cleared once the CMS app boots.
    markAutoSignInAttempt();
    const res = await fetch('/cms/login', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({idToken}),
    });
    const data = await getResData(res);

    if (res.status === 401) {
      const email = user?.email || '(no email)';
      const reason = data.reason ? ` Reason: ${data.reason}.` : '';
      return {
        success: false,
        rejected: true,
        error: `Login failed for: ${email}.${reason} If you believe this is a mistake, please contact a developer to help resolve the issue.`,
      };
    }
    if (res.status !== 200) {
      console.error('login failed');
      console.log(res.status, data);
      return {success: false, error: 'An unknown error has occurred.'};
    }
    if (!data.success) {
      console.error('login failed');
      console.log(res.status, data);
      return {
        success: false,
        rejected: true,
        error: data.reason
          ? `Login failed. Reason: ${data.reason}`
          : 'Login failed.',
      };
    }
    if (user.email) {
      setLastSignIn(user.email);
    }
    return {success: true};
  } catch (err: any) {
    console.error(err);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    };
  }
}

/** True when the user landed here by signing out of the CMS. */
function signedOutOfCms(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('signedOut') === '1';
}

function loginSuccessRedirect() {
  const params = new URLSearchParams(window.location.search);
  const continueParam = params.get('continue') || '';
  let redirectUrl = '/cms';
  // Resolve the continue value against the current origin and only honor
  // it if the result stays on this origin. This rejects absolute URLs
  // (`https://evil/`), protocol-relative URLs (`//evil`), and backslash
  // tricks that would otherwise pass a simple `startsWith('/')` check.
  try {
    const parsed = new URL(continueParam, window.location.origin);
    if (
      parsed.origin === window.location.origin &&
      !parsed.pathname.startsWith('/cms/login')
    ) {
      redirectUrl = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Fall through to the default.
  }
  window.location.replace(redirectUrl);
}

const root = document.getElementById('root')!;

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

  container.append(title, message);
  root.append(container);
}

try {
  const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
  const auth = getAuth(app);
  window.firebase = {app, auth};
  // Forget the previous session before the first render so a user who just
  // signed out isn't offered their old account or signed back in.
  if (signedOutOfCms()) {
    clearLastSignIn();
    clearAutoSignInAttempt();
  }
  root.innerHTML = '';
  render(<SignIn />, root);
} catch (err) {
  showStartupError(err);
}
