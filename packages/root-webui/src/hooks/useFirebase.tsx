import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import {createContext, useContext, useEffect, useState} from 'react';
import {LoadingPage} from '../pages/LoadingPage/LoadingPage';
import {useJsonRpc} from './useJsonRpc';

export const FirebaseContext = createContext<firebase.app.App | null>(null);

interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
}

export function FirebaseProvider({children}: {children?: React.ReactElement}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [app, setApp] = useState<firebase.app.App | null>(
    firebase.apps[0] || null
  );
  const rpc = useJsonRpc();

  async function initApp() {
    setLoading(true);
    let app: firebase.app.App;
    try {
      if (firebase.apps.length > 0) {
        app = firebase.apps[0];
      } else {
        const firebaseConfig = await rpc.fetch<FirebaseConfig>(
          'firebase.get_config'
        );
        app = firebase.initializeApp(firebaseConfig);
      }
      // Wait for firebase auth to finish initializing before setting the app
      // object. The onAuthStateChanged callback is called even if the user is
      // not signed in.
      firebase.auth().onAuthStateChanged(() => {
        setApp(app);
        setLoading(false);
      });
    } catch (e) {
      console.error(e);
      setError(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (app) {
      setLoading(false);
      return;
    }
    initApp();
  }, []);

  if (error) {
    return <div>error</div>;
  }
  if (loading) {
    return <LoadingPage />;
  }
  return (
    <FirebaseContext.Provider value={app}>{children}</FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const app = useContext(FirebaseContext);
  if (!app) {
    throw new Error(
      'useFirebase() should be called within a <FirebaseProvider>'
    );
  }
  return app;
}
