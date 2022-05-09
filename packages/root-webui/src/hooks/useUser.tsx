import {useFirebase} from './useFirebase';

export function useUser() {
  const app = useFirebase();
  return app.auth().currentUser;
}
