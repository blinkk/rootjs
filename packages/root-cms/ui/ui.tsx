import {render} from 'preact';
import {Route, Router} from 'preact-router';
import {MantineProvider} from '@mantine/core';
import {initializeApp} from 'firebase/app';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {Collection} from '../core/schema.js';
import {NotFoundPage} from './pages/NotFoundPage/NotFoundPage.js';
import './styles/main.css';
import {FirebaseContext} from './hooks/useFirebase.js';

declare global {
  interface Window {
    __ROOT_CTX: {
      user: {email: string; jwt: any};
      collections: Collection[];
    };
  }
}

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyDIoi6zECKeyJoCduYEmV5j9PIF-wbpaPo',
  authDomain: 'rootjs-dev.firebaseapp.com',
  projectId: 'rootjs-dev',
  storageBucket: 'rootjs-dev.appspot.com',
  messagingSenderId: '636169634531',
  appId: '1:636169634531:web:57d476af76584cca4e7bd6',
  measurementId: 'G-2CQDJJEVW6',
});

function App() {
  return (
    <MantineProvider
      theme={{
        fontFamily: 'Inter, sans-serif',
        fontSizes: {xs: 12, sm: 14, md: 16, lg: 18, xl: 20},
      }}
    >
      <FirebaseContext.Provider value={firebaseApp}>
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

const root = document.getElementById('root')!;
root.innerHTML = '';
render(<App />, root);
