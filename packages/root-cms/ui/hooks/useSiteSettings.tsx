import {doc, onSnapshot, updateDoc, FieldPath} from 'firebase/firestore';
import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'preact/hooks';
import type {SecurityRulesVersionDoc} from '../../shared/security-rules.js';
import {useFirebase} from './useFirebase.js';

/** Project level settings. Keys are stored in the database. */
export interface SiteSettings {
  /** The Google Drive folder where files created by Root.js are stored. If unspecified, files will be created in your "My Drive". */
  googleDriveFolder?: string;
  /** The default assignee for new tasks created within the CMS. */
  defaultAssignee?: string;
  /**
   * CSS applied to the CMS for everyone on the project, on top of the
   * configured theme. Experimental; edited under Settings → Theme.
   */
  customCss?: string;
}

export interface SiteSettingsContextValue {
  settings: SiteSettings;
  setSettings: (key: keyof SiteSettings, value: any) => Promise<void>;
  /** Deployed security rules versions recorded on `Projects/{projectId}`. */
  securityRulesVersion?: SecurityRulesVersionDoc;
  /** Whether the initial `Projects/{projectId}` snapshot has loaded. */
  loaded: boolean;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(
  null
);

export function SiteSettingsProvider(props: {children?: ComponentChildren}) {
  const {db, user} = useFirebase();
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [settings, setSettings] = useState<SiteSettings>({});
  const [securityRulesVersion, setSecurityRulesVersion] = useState<
    SecurityRulesVersionDoc | undefined
  >(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const docRef = doc(db, 'Projects', projectId);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          setSettings(data.settings || {});
          setSecurityRulesVersion(data.securityRulesVersion || undefined);
        } else {
          setSettings({});
          setSecurityRulesVersion(undefined);
        }
        setLoaded(true);
      },
      (error) => {
        console.error('Failed to subscribe to site settings:', error);
        setLoaded(true);
      }
    );
    return () => unsubscribe();
  }, [db, projectId, user.uid]);

  const setSetting = useCallback(
    async (key: keyof SiteSettings, value: any) => {
      const docRef = doc(db, 'Projects', projectId);
      try {
        await updateDoc(docRef, new FieldPath('settings', key), value);
      } catch (error) {
        console.error('Failed to set setting', key, error);
      }
    },
    [db, projectId, user.uid]
  );

  const value = useMemo(
    () => ({
      settings,
      setSettings: setSetting,
      securityRulesVersion,
      loaded,
    }),
    [settings, setSetting, securityRulesVersion, loaded]
  );

  return (
    <SiteSettingsContext.Provider value={value}>
      {props.children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettingsContextValue {
  const context = useContext(SiteSettingsContext);
  if (!context) {
    throw new Error(
      'useSiteSettings must be used within a <SiteSettingsProvider>'
    );
  }
  return context;
}
