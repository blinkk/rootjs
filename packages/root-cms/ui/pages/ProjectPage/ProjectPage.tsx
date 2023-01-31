import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  const collections = window.__ROOT_CTX?.collections || [];
  return (
    <Layout>
      <div className="ProjectPage">
        <h1>Collections:</h1>
        <ul>
          {collections.map((collection) => (
            <li>
              <a href={`/cms/content/${collection.name}`}>{collection.name}</a>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
