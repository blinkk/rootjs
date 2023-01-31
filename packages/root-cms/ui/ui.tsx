import {render} from 'preact';
import {Route, Router} from 'preact-router';
import {CollectionPage} from './pages/CollectionPage/CollectionPage.js';
import {DocumentPage} from './pages/DocumentPage/DocumentPage.js';
import {ProjectPage} from './pages/ProjectPage/ProjectPage.js';
import {Collection} from '../core/schema.js';
import './styles/main.css';

declare global {
  interface Window {
    __ROOT_CTX: {
      user: any;
      collections: Collection[];
    };
  }
}

function App() {
  return (
    <Router>
      <Route path="/cms" component={ProjectPage} />
      <Route path="/cms/content/:collection?" component={CollectionPage} />
      <Route path="/cms/content/:collection/:slug" component={DocumentPage} />
    </Router>
  );
}

const root = document.getElementById('root')!;
root.innerHTML = '';
render(<App />, root);
