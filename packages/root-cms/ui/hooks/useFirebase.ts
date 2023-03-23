import {FirebaseApp} from 'firebase/app';
import {Auth, User} from 'firebase/auth';
import {Firestore} from 'firebase/firestore';
import {FirebaseStorage} from 'firebase/storage';
import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export interface FirebaseContextObject {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  user: User;
}

export const FirebaseContext = createContext<FirebaseContextObject | null>(
  null
);

export function useFirebase(): FirebaseContextObject {
  const value = useContext(FirebaseContext);
  if (!value) {
    throw new Error(
      'useFirebase() should be called within a <FirebaseProvider>'
    );
  }
  return value;
}
