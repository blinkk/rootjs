import {useWorkspace} from './useWorkspace';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import {createContext, useContext, useEffect, useState} from 'react';
import {UserSignInPage} from '../pages/UserSignInPage';
import {LoadingPage} from '../pages/LoadingPage';

type User = firebase.User;

export const UserContext = createContext<User | null>(null);

export function UserProvider({children}: {children: JSX.Element}) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const workspace = useWorkspace();

  useEffect(() => {
    if (!workspace) {
      return;
    }
    const auth = workspace.firebase.auth();
    const unregisterAuthObserver = auth.onAuthStateChanged(user => {
      setIsSignedIn(!!user);
      if (user) {
        setUser(user);
      }
      setLoading(false);
    });
    return () => unregisterAuthObserver();
  }, [workspace]);

  if (loading) {
    return <LoadingPage />;
  }
  if (!isSignedIn) {
    return <UserSignInPage />;
  }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext)!;
}
