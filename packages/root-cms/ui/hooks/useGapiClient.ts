import {resolve} from 'path';
import {useEffect, useState} from 'preact/hooks';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const DISCOVERY_DOCS = [
  'https://sheets.googleapis.com/$discovery/rest?version=v4',
];

export interface GapiClient {
  enabled: boolean;
  loading: boolean;
  isLoggedIn: boolean;
  login: () => Promise<void>;
}

export function useGapiClient(): GapiClient {
  const enabled = Boolean(
    window.__ROOT_CTX.gapi?.apiKey && window.__ROOT_CTX.gapi?.clientId
  );
  const [loading, setLoading] = useState(enabled);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // const [accessToken, setAccessToken] =
  //   useState<google.accounts.oauth2.TokenResponse | null>(null);

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
    return new Promise<void>((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.__ROOT_CTX.gapi!.clientId!,
        scope: SCOPES.join(' '),
        callback: async (tokenResponse) => {
          console.log('logged in');
          console.log(tokenResponse);
          // setAccessToken(tokenResponse);

          setIsLoggedIn(true);
          resolve();
        },
      });

      if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({prompt: 'consent'});
      } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({prompt: ''});
      }
    });
  }

  return {enabled, loading, isLoggedIn, login};
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
            await gapi.client.init({
              // clientId: window.__ROOT_CTX.gapi?.clientId,
              // scope: SCOPES.join(' '),
              // discoveryDocs: DISCOVERY_DOCS,
            });
            gapi.client.load(DISCOVERY_DOCS[0]).then(() => {
              console.log('gapi.client loaded');
              resolve();
            });
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
