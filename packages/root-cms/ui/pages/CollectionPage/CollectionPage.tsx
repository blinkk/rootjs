import {Layout} from '../../layout/Layout.js';
import './CollectionPage.css';

export function CollectionPage(props: any) {
  const collections = window.__ROOT_CTX.collections || [];
  const collection = collections.find((c) => c.name === props.collection);
  if (!collection) {
    return (
      <Layout>
        <div className="CollectionPage">
          <h1>Not found: {props.collection}</h1>
        </div>
      </Layout>
    );
  }
  return (
    <Layout>
      <div className="CollectionPage">
        <h1>{collection.name}</h1>
      </div>
    </Layout>
  );
}
