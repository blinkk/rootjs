import {render} from 'preact';
import {FirebaseApp, initializeApp} from 'firebase/app';
import {Auth, getAuth, Persistence} from 'firebase/auth';
import './styles/global.css';
import {SignInButton} from './components/SignInButton/SignInButton.js';

declare global {
  interface Window {
    __ROOT_CTX: {
      firebaseConfig: Record<string, string>;
    };
    firebase: {
      app: FirebaseApp;
      auth: Auth;
    };
  }
}

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
const auth = getAuth(app);
auth.setPersistence('NONE');
window.firebase = {app, auth};

function App() {
  return (
    <div className="SignIn">
      <h1>Hello. Welcome.</h1>
      <SignInButton />
    </div>
  );
}

const root = document.getElementById('root')!;
root.innerHTML = '';
render(<App />, root);
