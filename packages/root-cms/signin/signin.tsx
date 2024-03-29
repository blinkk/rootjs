import {FirebaseApp, initializeApp} from 'firebase/app';
import {GoogleAuthProvider, signInWithPopup} from 'firebase/auth';
import {Auth, getAuth} from 'firebase/auth';
import {render} from 'preact';
import {useState} from 'preact/hooks';
import './styles/global.css';
import './styles/signin.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      name: string;
      firebaseConfig: Record<string, string>;
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
      <SignIn.Button onError={onError} />
      {errorMsg && <p className="signin__error">{errorMsg}</p>}
    </div>
  );
}

interface ButtonProps {
  onError: (msg: string) => void;
}

SignIn.Button = (props: ButtonProps) => {
  async function getResData(res: Response): Promise<any> {
    try {
      return await res.json();
    } catch (err) {
      console.error(err);
    }
    return {};
  }

  async function signIn() {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    const result = await signInWithPopup(window.firebase.auth, provider);
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
        props.onError(
          `Login failed for: ${email}. Reason: ${data.reason}. If you believe this is a mistake, please contact a developer to help resolve the issue.`
        );
      } else {
        props.onError(
          `Login failed for: ${email}. If you believe this is a mistake, please contact a developer to help resolve the issue.`
        );
      }
      return;
    }
    if (res.status !== 200) {
      console.error('login failed');
      console.log(res.status, data);
      props.onError('An unknown error has occurred.');
      return;
    }
    if (!data.success) {
      console.error('login failed');
      console.log(res.status, data);
      if (data.reason) {
        props.onError(`Login failed. Reason: ${data.reason}`);
      } else {
        props.onError('Login failed.');
      }
      return;
    }
    loginSuccessRedirect();
  }

  return (
    <button className="signin__button" onClick={signIn}>
      <div className="signin__button__icon">
        <SignIn.GLogo />
      </div>
      <div className="signin__button__label">Sign in with Google</div>
    </button>
  );
};

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

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
const auth = getAuth(app);
window.firebase = {app, auth};
const root = document.getElementById('root')!;
root.innerHTML = '';
render(<SignIn />, root);
