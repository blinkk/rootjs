import {GoogleAuthProvider, signInWithPopup} from 'firebase/auth';
import './SignInButton.css';

export function SignInButton() {
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

    const params = new URLSearchParams(window.location.search);
    let redirectUrl = params.get('continue');
    if (
      !redirectUrl ||
      !redirectUrl.startsWith('/cms') ||
      redirectUrl.startsWith('/cms/login')
    ) {
      redirectUrl = '/cms';
    }
    window.location.href = redirectUrl;
  }

  return (
    <button className="SignInButton" onClick={signIn}>
      Sign in
    </button>
  );
}
