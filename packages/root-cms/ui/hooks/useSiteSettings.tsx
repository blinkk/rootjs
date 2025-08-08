import {Button} from '@mantine/core';
import {IconExternalLink} from '@tabler/icons-preact';
import {doc, onSnapshot, updateDoc, FieldPath} from 'firebase/firestore';
import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useCallback, useState} from 'preact/hooks';
import {buildGoogleDriveFolderUrl} from '../utils/gsheets.js';
import {useFirebase} from './useFirebase.js';

interface SiteSettings {
  /** The Google Drive folder where files created by Root CMS are stored. If unspecified, files will be created in your "My Drive". */
  googleDriveFolder?: string;
}

interface Setting {
  name: string;
  key: keyof SiteSettings;
  description: string;
  placeholder?: string;
  /** Additional UI to show adjacent to the settings field. */
  ui?: (value: string | undefined) => preact.JSX.Element;
}

export const SITE_SETTINGS: Setting[] = [
  {
    name: 'Google Drive Folder',
    key: 'googleDriveFolder',
    placeholder: 'https://drive.google.com/drive/folders/...',
    description:
      'Where Google Sheets created by Root CMS\'s localization process are stored. If unspecified, they will be created in your "My Drive".',
    ui: (value) => {
      return (
        <Button
          disabled={!value}
          variant="outline"
          size="compact-sm"
          color="dark"
          rightIcon={<IconExternalLink size={16} />}
          onClick={() => {
            if (value) {
              window.open(value, buildGoogleDriveFolderUrl(value));
            }
          }}
        >
          Open
        </Button>
      );
    },
  },
];

export interface SiteSettingsContextValue {
  settings: SiteSettings;
  setSettings: (key: keyof SiteSettings, value: any) => Promise<void>;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(
  null
);

export function SiteSettingsProvider(props: {children?: ComponentChildren}) {
  const {db, user} = useFirebase();
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [settings, setSettings] = useState<SiteSettings>({});

  useEffect(() => {
    const docRef = doc(db, 'Projects', projectId);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          setSettings(data.settings || {});
        } else {
          setSettings({});
        }
      },
      (error) => {
        console.error('Failed to subscribe to site settings:', error);
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

  return (
    <SiteSettingsContext.Provider
      value={{settings: settings, setSettings: setSetting}}
    >
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
