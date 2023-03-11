import {render} from 'preact';
import {Route, Router} from 'preact-router';
import {MantineProvider} from '@mantine/core';
import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {Collection} from '../core/schema.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import {FirebaseContext, FirebaseContextObject} from './hooks/useFirebase.js';
import './styles/global.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      rootConfig: {
        projectId: string;
        domain: string;
      };
      firebaseConfig: Record<string, string>;
      collections: Collection[];
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
      <FirebaseContext.Provider value={window.firebase}>
        <Router>
          <Route path="/cms" component={ProjectPage} />
          <Route path="/cms/content/:collection?" component={CollectionPage} />
          <Route
            path="/cms/content/:collection/:slug"
            component={DocumentPage}
          />
          <Route default component={NotFoundPage} />
        </Router>
      </FirebaseContext.Provider>
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
  console.log('logged in as:');
  console.log(user.email);
  window.firebase = {app, auth, db, user};
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  render(<App />, root);
});
