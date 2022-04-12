import firebase from 'firebase/compat/app';
import sfa from 'react-firebaseui/StyledFirebaseAuth';
import {Title} from '@mantine/core';
import {useWorkspace} from '../../hooks/useWorkspace';
import styles from './UserSignInPage.module.scss';
import 'firebase/compat/auth';

// Configure Firebase UI.
// https://github.com/firebase/firebaseui-web-react
const FIREBASE_UI_CONFIG = {
  // Popup signin flow rather than redirect flow.
  signInFlow: 'popup',
  // signInOptions: [GoogleAuthProvider.PROVIDER_ID],
  signInOptions: [firebase.auth.GoogleAuthProvider.PROVIDER_ID],
  callbacks: {
    // Avoid redirects after sign-in.
    signInSuccessWithAuthResult: () => false,
  },
};

export function UserSignInPage() {
  const workspace = useWorkspace();
  if (!workspace) {
    return <div>No workspace found</div>;
  }
  const auth = workspace.firebase.auth();
  // For some reason, in the production build, vite has problems resolving
  // default exports.
  // https://github.com/vitejs/vite/issues/6776
  const StyledFirebaseAuth = (sfa as any).default || sfa;
  return (
    <div className={styles.UserSignInPage}>
      <div className={styles.UserSignInPage_Logo}></div>
      <Title className={styles.UserSignInPage_Title} order={1}>
        Log in to CMS
      </Title>
      <StyledFirebaseAuth uiConfig={FIREBASE_UI_CONFIG} firebaseAuth={auth} />
    </div>
  );
}
