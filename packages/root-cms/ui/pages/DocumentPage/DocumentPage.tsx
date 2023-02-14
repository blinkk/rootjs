import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import {DocumentEditor} from '../DocumentEditor/DocumentEditor.js';
import './DocumentPage.css';

interface DocumentPageProps {
  collection: string;
  slug: string;
}

export function DocumentPage(props: any) {
  const collectionId = props.collection;
  const slug = props.slug;
  const docId = `${collectionId}/${slug}`;

  const collections = window.__ROOT_CTX.collections || [];
  const collection = collections.find((c) => {
    return c.name === collectionId;
  });

  if (!collection) {
    return <div>Could not find collection.</div>;
  }

  return (
    <Layout>
      <SplitPanel className="DocumentPage" localStorageId="DocumentPage">
        <SplitPanel.Item className="DocumentPage__side">
          <div className="DocumentPage__side__docId">{docId}</div>
          <div className="DocumentPage__side__editor">
            <DocumentEditor collection={collection} />
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="DocumentPage__main">TODO: Instant Preview</SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}
