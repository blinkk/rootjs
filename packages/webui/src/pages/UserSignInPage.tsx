import firebase from 'firebase/compat/app';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import {Title} from '@mantine/core';
import styles from './UserSignInPage.module.sass';

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

interface UserSignInPageProps {
  auth: firebase.auth.Auth | null;
}

export function UserSignInPage(props: UserSignInPageProps) {
  if (!props.auth) {
    return <></>;
  }
  return (
    <div className={styles.UserSignInPage}>
      <div className={styles.UserSignInPage_Logo}></div>
      <Title className={styles.UserSignInPage_Title} order={1}>
        Log in to CMS
      </Title>
      <StyledFirebaseAuth
        uiConfig={FIREBASE_UI_CONFIG}
        firebaseAuth={props.auth}
      />
    </div>
  );
}
