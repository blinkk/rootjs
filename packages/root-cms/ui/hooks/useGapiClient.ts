import {useLocalStorage} from '@mantine/hooks';
import {useEffect, useState} from 'preact/hooks';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const DISCOVERY_DOCS = [
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
];

export interface GapiClient {
  enabled: boolean;
  loading: boolean;
  isLoggedIn: () => boolean;
  login: () => Promise<void>;
}

interface GapiUserConsent {
  clientId?: string;
  scopes?: string[];
  at?: number;
}

export function useGapiClient(): GapiClient {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const enabled = Boolean(
    window.__ROOT_CTX.gapi?.apiKey && window.__ROOT_CTX.gapi?.clientId
  );
  const [loading, setLoading] = useState(enabled);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(0);
  const [userConsent, setUserConsent] = useLocalStorage<GapiUserConsent>({
    key: `root-cms::${projectId}::gapi-user-consent`,
    defaultValue: {},
  });

  async function initGapi() {
    await Promise.all([loadGapiScript(), loadGisScript()]);
    setLoading(false);
  }

  useEffect(() => {
    if (enabled) {
      initGapi();
    }
  }, []);

  function login() {
    return new Promise<void>((resolve) => {
      const clientId = window.__ROOT_CTX.gapi!.clientId!;
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        callback: async (token) => {
          // console.log('logged in');
          // console.log(token);
          const expiresAt = timestamp() + parseInt(token.expires_in);
          setTokenExpiresAt(expiresAt);
          // setCachedToken({token, expiresAt});
          setUserConsent({
            at: timestamp(),
            clientId: clientId,
            scopes: SCOPES,
          });
          resolve();
        },
      });

      // if (gapi.client.getToken() === null) {
      if (userConsent && verifyUserConsent(userConsent)) {
        // Skip display of account chooser and consent dialog when user has
        // previously consented.
        console.log('requesting token without prompt');
        tokenClient.requestAccessToken({prompt: ''});
      } else {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        console.log('requesting token with prompt');
        tokenClient.requestAccessToken({prompt: 'consent'});
      }
    });
  }

  function isLoggedIn() {
    return timestamp() < tokenExpiresAt;
  }

  return {enabled, loading, isLoggedIn, login};
}

function verifyUserConsent(userConsent: GapiUserConsent) {
  if (!userConsent) {
    return false;
  }

  if (!userConsent.at) {
    return false;
  }

  // Verify client id matches.
  const clientId = window.__ROOT_CTX.gapi?.clientId;
  if (userConsent.clientId !== clientId) {
    return false;
  }

  // Verify all scopes.
  const scopes = userConsent.scopes || [];
  return SCOPES.every((scope) => scopes.includes(scope));
}

function timestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

let loadGapiScriptPromise: Promise<void> | null = null;

async function loadGapiScript() {
  if (!loadGapiScriptPromise) {
    loadGapiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';

      script.onload = () => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({});
            await Promise.all(
              DISCOVERY_DOCS.map((discoveryDoc) =>
                gapi.client.load(discoveryDoc)
              )
            );
            console.log('gapi loaded');
            resolve();
          } catch (error) {
            console.error('Error initializing gapi:', error);
            reject(error);
          }
        });
      };

      script.onerror = () => {
        console.error('gapi script failed to load');
        reject(new Error('gapi script failed to load'));
      };

      document.head.appendChild(script);
    });
  }
  return loadGapiScriptPromise;
}

let loadGisScriptPromise: Promise<void> | null = null;

async function loadGisScript() {
  if (!loadGisScriptPromise) {
    loadGisScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';

      script.onload = () => {
        resolve();
      };

      script.onerror = () => {
        console.error('gis script failed to load');
        reject(new Error('gis script failed to load'));
      };

      document.head.appendChild(script);
    });
  }
  return loadGisScriptPromise;
}
