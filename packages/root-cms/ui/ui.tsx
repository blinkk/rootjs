import {render} from 'preact';
import {Route, Router} from 'preact-router';
import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {NotificationsProvider} from '@mantine/notifications';
import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {Collection} from '../core/schema.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import {SettingsPage} from './pages/SettingsPage/SettingsPage.js';
import {AssetsPage} from './pages/AssetsPage/AssetsPage.js';
import {DataPage} from './pages/DataPage/DataPage.js';
import {TranslationsPage} from './pages/TranslationsPage/TranslationsPage.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import './styles/global.css';
import './styles/theme.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        domain: string;
      };
      firebaseConfig: Record<string, string>;
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
        <ModalsProvider>
          <FirebaseContext.Provider value={window.firebase}>
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
              <Route default component={NotFoundPage} />
            </Router>
          </FirebaseContext.Provider>
        </ModalsProvider>
      </NotificationsProvider>
    </MantineProvider>
  );
}

function loginRedirect() {
  let originalUrl = window.location.pathname;
  if (window.location.search) {
    originalUrl = `originalUrl?${window.location.search}`;
  }
  const params = new URLSearchParams({continue: originalUrl});
  window.location.replace(`/cms/login?${params.toString()}`);
}

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.onAuthStateChanged((user) => {
  if (!user) {
    loginRedirect();
    return;
  }
  window.firebase = {app, auth, db, user};
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  render(<App />, root);
});
