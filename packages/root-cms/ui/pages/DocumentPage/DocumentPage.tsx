import {ActionIcon} from '@mantine/core';
import {IconArrowLeft} from '@tabler/icons-preact';
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
          <div className="DocumentPage__side__header">
            <a href={`/cms/content/${collectionId}`}>
              <ActionIcon className="DocumentPage__side__header__back">
                <IconArrowLeft size={16} />
              </ActionIcon>
            </a>
            <div className="DocumentPage__side__header__docId">{docId}</div>
          </div>
          <div className="DocumentPage__side__editor">
            <DocumentEditor collection={collection} />
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="DocumentPage__main">
          TODO: Instant Preview
        </SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}
