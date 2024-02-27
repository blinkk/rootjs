import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {NotificationsProvider} from '@mantine/notifications';
import {initializeApp} from 'firebase/app';
import {User, getAuth} from 'firebase/auth';
import {initializeFirestore} from 'firebase/firestore';
import {getStorage} from 'firebase/storage';
import {render} from 'preact';
import {Route, Router} from 'preact-router';

import {Collection} from '../core/schema.js';

import {CopyDocModal} from './components/CopyDocModal/CopyDocModal.js';
import {DocPickerModal} from './components/DocPickerModal/DocPickerModal.js';
import {EditJsonModal} from './components/EditJsonModal/EditJsonModal.js';
import {LocalizationModal} from './components/LocalizationModal/LocalizationModal.js';
import {PublishDocModal} from './components/PublishDocModal/PublishDocModal.js';
import {VersionHistoryModal} from './components/VersionHistoryModal/VersionHistoryModal.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import {AssetsPage} from './pages/AssetsPage/AssetsPage.js';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DataPage} from './pages/DataPage/DataPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {SettingsPage} from './pages/SettingsPage/SettingsPage.js';
import {TranslationsArbPage} from './pages/TranslationsArbPage/TranslationsArbPage.js';
import {TranslationsPage} from './pages/TranslationsPage/TranslationsPage.js';
import './styles/global.css';
import './styles/theme.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        projectName: string;
        domain: string;
        base: string;
        gci: string | boolean;
        i18n: {
          locales?: string[];
          urlFormat?: string;
          groups?: Record<string, {label?: string; locales: string[]}>;
        };
      };
      firebaseConfig: Record<string, string>;
      gapi?: {
        apiKey: string;
        clientId: string;
      };
      collections: Record<string, Collection>;
    };
    firebase: FirebaseContextObject;
  }
}

function App() {
  return (
    <MantineProvider
      theme={{
        fontFamily: 'Inter, sans-serif',
        fontSizes: {xs: 12, sm: 14, md: 16, lg: 18, xl: 20},
      }}
    >
      <NotificationsProvider>
        <FirebaseContext.Provider value={window.firebase}>
          <ModalsProvider
            modals={{
              [CopyDocModal.id]: CopyDocModal,
              [DocPickerModal.id]: DocPickerModal,
              [EditJsonModal.id]: EditJsonModal,
              [LocalizationModal.id]: LocalizationModal,
              [PublishDocModal.id]: PublishDocModal,
              [VersionHistoryModal.id]: VersionHistoryModal,
            }}
          >
            <Router>
              <Route path="/cms" component={ProjectPage} />
              <Route path="/cms/assets" component={AssetsPage} />
              <Route
                path="/cms/content/:collection?"
                component={CollectionPage}
              />
              <Route
                path="/cms/content/:collection/:slug"
                component={DocumentPage}
              />
              <Route path="/cms/data" component={DataPage} />
              <Route path="/cms/settings" component={SettingsPage} />
              <Route path="/cms/translations" component={TranslationsPage} />
              <Route
                path="/cms/translations/arb"
                component={TranslationsArbPage}
              />
              <Route default component={NotFoundPage} />
            </Router>
          </ModalsProvider>
        </FirebaseContext.Provider>
      </NotificationsProvider>
    </MantineProvider>
  );
}

function loginRedirect() {
  let originalUrl = window.location.pathname;
  if (window.location.search) {
    originalUrl = `${originalUrl}?${window.location.search}`;
  }
  const params = new URLSearchParams({continue: originalUrl});
  window.location.replace(`/cms/login?${params.toString()}`);
}

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
// const db = getFirestore(app);
// NOTE(stevenle): the firestore web channel rpc sometimes has issues in
// collections with a large number of docs. Forcing long polling and disabling
// fetch streams seems to work for some people. This may cause performance
// issues however.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
} as any);
const auth = getAuth(app);
const storage = getStorage(app);
auth.onAuthStateChanged((user) => {
  if (!user) {
    loginRedirect();
    return;
  }
  window.firebase = {app, auth, db, storage, user};
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  render(<App />, root);

  updateSession(user);
});

async function updateSession(user: User) {
  const idToken = await user.getIdToken();
  const res = await fetch('/cms/login', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({idToken}),
  });
  if (res.status !== 200) {
    console.error('login failed');
    console.log(res);
    return;
  }
  const data = await res.json();
  if (!data.success) {
    console.error('login failed');
    console.log(res);
    return;
  }
}
