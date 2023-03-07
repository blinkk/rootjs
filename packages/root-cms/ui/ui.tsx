import {render} from 'preact';
import {Route, Router} from 'preact-router';
import {MantineProvider} from '@mantine/core';
import {FirebaseApp, initializeApp} from 'firebase/app';
import {Auth, getAuth, signInWithCredential} from 'firebase/auth';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {Collection} from '../core/schema.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import {FirebaseContext} from './hooks/useFirebase.js';
import './styles/global.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      id: string;
      firebaseConfig: Record<string, string>;
      user: {email: string; jwt: any};
      collections: Collection[];
    };
    firebase: {
      app: FirebaseApp;
      auth: Auth;
    };
  }
}

const app = initializeApp(window.__ROOT_CTX.firebaseConfig);
const auth = getAuth(app);
window.firebase = {app, auth};

function App() {
  return (
    <MantineProvider
      theme={{
        fontFamily: 'Inter, sans-serif',
        fontSizes: {xs: 12, sm: 14, md: 16, lg: 18, xl: 20},
      }}
    >
      <FirebaseContext.Provider value={app}>
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

auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('logged in as:');
    console.log(user);
  } else {
    console.log('not logged in');
  }
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  render(<App />, root);
});
