import {FirebaseApp} from 'firebase/app';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export const FirebaseContext = createContext<FirebaseApp | null>(null);

export function useFirebase(): FirebaseApp {
  const app = useContext(FirebaseContext);
  if (!app) {
    throw new Error(
      'useFirebase() should be called within a <FirebaseProvider>'
    );
  }
  return app;
}
