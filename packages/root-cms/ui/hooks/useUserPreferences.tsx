import {doc, onSnapshot, setDoc} from 'firebase/firestore';
import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useCallback, useState} from 'preact/hooks';
import {useFirebase} from './useFirebase.js';

export interface UserPreferencesContextValue {
  preferences: Record<string, any>;
  setPreference: (key: string, value: any) => Promise<void>;
}

const UserPreferencesContext =
  createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider(props: {children?: ComponentChildren}) {
  const {db, user} = useFirebase();
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [preferences, setPreferences] = useState<Record<string, any>>({});

  useEffect(() => {
    const prefDocRef = doc(db, 'Projects', projectId, 'Users', user.uid);
    const unsubscribe = onSnapshot(
      prefDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setPreferences(snapshot.data());
        } else {
          setPreferences({});
        }
      },
      (error) => {
        console.error('Failed to subscribe to user preferences:', error);
      }
    );
    return () => unsubscribe();
  }, [db, projectId, user.uid]);

  const setPreference = useCallback(
    async (key: string, value: any) => {
      const prefDocRef = doc(db, 'Projects', projectId, 'Users', user.uid);
      try {
        await setDoc(prefDocRef, {[key]: value}, {merge: true});
      } catch (error) {
        console.error('Failed to set user preference', key, error);
      }
    },
    [db, projectId, user.uid]
  );

  return (
    <UserPreferencesContext.Provider value={{preferences, setPreference}}>
      {props.children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error(
      'useUserPreferences must be used within a <UserPreferencesProvider>'
    );
  }
  return context;
}
