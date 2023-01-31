import {IconFolder} from '@tabler/icons-preact';
import {useState} from 'preact/hooks';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import './CollectionPage.css';

export function CollectionPage(props: any) {
  const [query, setQuery] = useState('');

  const collections = window.__ROOT_CTX.collections || [];
  const matchedCollections = collections.filter((c) => {
    if (!query) {
      return true;
    }
    return c.name.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <Layout>
      <SplitPanel className="CollectionPage" localStorageId="CollectionPage">
        <SplitPanel.Item className="CollectionPage__side">
          <div className="CollectionPage__side__title">Collections</div>
          <div className="CollectionPage__side__search">
            <input
              type="text"
              placeholder="Search"
              onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="CollectionPage__side__collections">
            {matchedCollections.map((collection) => (
              <a
                className="CollectionPage__side__collection"
                href={`/cms/content/${collection.name}`}
                key={collection.name}
              >
                <div className="CollectionPage__side__collection__icon">
                  <IconFolder size={20} strokeWidth="1.75" />
                </div>
                <div className="CollectionPage__side__collection__name">
                  {collection.name}
                </div>
              </a>
            ))}
            {matchedCollections.length === 0 && (
              <div className="CollectionPage__side__collections__empty">
                No collections match your query.
              </div>
            )}
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="CollectionPage__main" fluid>
          {props.collection ? (
            <CollectionPage.DocsList collection={props.collection} />
          ) : (
            <div className="CollectionPage__main__unselected">
              <div className="CollectionPage__main__unselected__title">
                Select a collection to get started.
              </div>
            </div>
          )}
        </SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}

interface DocsListProps {
  collection: string;
}

CollectionPage.DocsList = (props: DocsListProps) => {
  const collections = window.__ROOT_CTX.collections || [];
  const collection = collections.find((c) => c.name === props.collection);
  if (!collection) {
    return (
      <div className="CollectionPage__docsList">
        <div className="CollectionPage__docsList__notFound">
          Could not find collection: {props.collection}
        </div>
      </div>
    );
  }
  return (
    <div className="CollectionPage__docsList">
      <div className="CollectionPage__docsList__title">{collection.name}</div>
    </div>
  );
};
