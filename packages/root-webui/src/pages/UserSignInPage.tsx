import firebase from 'firebase/compat/app';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import {Title} from '@mantine/core';
import styles from './UserSignInPage.module.sass';
import {useWorkspace} from '../hooks/useWorkspace';
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
    return <></>;
  }
  const auth = workspace.firebase.auth();
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
