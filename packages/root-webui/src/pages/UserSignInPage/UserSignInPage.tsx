import firebase from 'firebase/compat/app';
import sfa from 'react-firebaseui/StyledFirebaseAuth';
import {Center} from '@mantine/core';
import 'firebase/compat/auth';
import {useFirebase} from '../../hooks/useFirebase';

type User = firebase.User;

// Configure Firebase UI.

interface UserSignInPageProps {
  onChange?: (user: firebase.User) => void;
}

export function UserSignInPage(props: UserSignInPageProps) {
  const app = useFirebase();
  const auth = app.auth();
  // For some reason, in the production build, vite has problems resolving
  // default exports.
  // https://github.com/vitejs/vite/issues/6776
  const StyledFirebaseAuth = (sfa as any).default || sfa;
  return (
    <Center style={{height: '100vh', width: '100vw'}}>
      <StyledFirebaseAuth
        uiConfig={{
          signInFlow: 'popup',
          signInOptions: [firebase.auth.GoogleAuthProvider.PROVIDER_ID],
          callbacks: {
            signInSuccessWithAuthResult: () => {
              if (props.onChange) {
                props.onChange(auth.currentUser!);
              }
              // Avoid redirects after sign-in.
              return false;
            },
          },
        }}
        firebaseAuth={auth}
      />
    </Center>
  );
}
