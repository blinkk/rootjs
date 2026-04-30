import {FirebaseApp, initializeApp} from 'firebase/app';
import {GoogleAuthProvider, signInWithPopup} from 'firebase/auth';
import {Auth, getAuth} from 'firebase/auth';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';
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

function SignIn() {
  const [errorMsg, setErrorMsg] = useState('');
  const title = window.__ROOT_CTX.name;
  const warning = window.__ROOT_CTX.warning;

  function onError(msg: string) {
    setErrorMsg(msg);
  }

  return (
    <div className="signin">
      <div className="signin__headline">
        {title && <h1 className="signin__headline__title">{title}</h1>}
        <p className="signin__headline__body">
          {title ? `Sign in to continue to ${title}` : 'Sign in to continue'}
        </p>
      </div>
      {warning && <div className="signin__warning">{warning}</div>}
      <SignIn.Button onError={onError} />
      {errorMsg && <p className="signin__error">{errorMsg}</p>}
    </div>
  );
}

interface ButtonProps {
  onError: (msg: string) => void;
}

/** Tracks the current phase of the sign-in flow. */
type SignInStatus =
  /** No sign-in in progress; the button is clickable. */
  | 'idle'
  /** The Google auth popup is open and we're waiting for the user. */
  | 'popup'
  /** The popup closed successfully; we're validating the token with the server. */
  | 'verifying'
  /** Server validated the token; navigating to the app. */
  | 'redirecting';

SignIn.Button = (props: ButtonProps) => {
  const [status, setStatus] = useState<SignInStatus>('idle');
  const attemptRef = useRef(0);
  const popupRef = useRef<Window | null>(null);

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

  async function getResData(res: Response): Promise<any> {
    try {
      return await res.json();
    } catch (err) {
      console.error(err);
    }
    return {};
  }

  async function signIn() {
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
      updateError(
        code === 'auth/network-request-failed'
          ? 'Network error. Please check your connection and try again.'
          : `Sign in failed: ${err?.message || 'unknown error'}`
      );
      updateStatus('idle');
      return;
    }

    updateStatus('verifying');

    try {
      const user = result.user;
      const idToken = await user.getIdToken();
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
        if (data.reason) {
          updateError(
            `Login failed for: ${email}. Reason: ${data.reason}. If you believe this is a mistake, please contact a developer to help resolve the issue.`
          );
        } else {
          updateError(
            `Login failed for: ${email}. If you believe this is a mistake, please contact a developer to help resolve the issue.`
          );
        }
        updateStatus('idle');
        return;
      }
      if (res.status !== 200) {
        console.error('login failed');
        console.log(res.status, data);
        updateError('An unknown error has occurred.');
        updateStatus('idle');
        return;
      }
      if (!data.success) {
        console.error('login failed');
        console.log(res.status, data);
        if (data.reason) {
          updateError(`Login failed. Reason: ${data.reason}`);
        } else {
          updateError('Login failed.');
        }
        updateStatus('idle');
        return;
      }
      updateStatus('redirecting');
      loginSuccessRedirect();
    } catch (err: any) {
      console.error(err);
      updateError('An unexpected error occurred. Please try again.');
      updateStatus('idle');
    }
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
    <button
      className={joinClassNames(
        'signin__button',
        busy && 'signin__button--busy'
      )}
      onClick={signIn}
      disabled={busy}
    >
      <div className="signin__button__icon">
        {busy ? <SignIn.Spinner /> : <SignIn.GLogo />}
      </div>
      <div className="signin__button__label">{label}</div>
    </button>
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

function loginSuccessRedirect() {
  const params = new URLSearchParams(window.location.search);
  let redirectUrl = params.get('continue');
  if (
    !redirectUrl ||
    !redirectUrl.startsWith('/') ||
    redirectUrl.startsWith('/cms/login')
  ) {
    redirectUrl = '/cms';
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
  root.innerHTML = '';
  render(<SignIn />, root);
} catch (err) {
  showStartupError(err);
}
