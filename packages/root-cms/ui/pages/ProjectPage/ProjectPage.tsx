import {CollectionList} from '../../components/CollectionList/CollectionList.js';
import {Layout} from '../../layout/Layout.js';
import './ProjectPage.css';

export function ProjectPage() {
  return (
    <Layout>
      <div className="ProjectPage">
        <h1>Collections:</h1>
        <CollectionList />
      </div>
    </Layout>
  );
}
