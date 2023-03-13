import {IconCirclePlus, IconFolder} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {
  Badge,
  Button,
  Image,
  Loader,
  Select,
  Tabs,
  Tooltip,
} from '@mantine/core';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';
import {useFirebase} from '../../hooks/useFirebase.js';
import {route} from 'preact-router';
import {
  collection,
  getDocs,
  orderBy as queryOrderby,
  Query,
  query,
  documentId,
  Timestamp,
} from 'firebase/firestore';
import './CollectionPage.css';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {getNestedValue} from '../../utils/objects.js';
import {DocStatusBadges} from '../../components/DocStatusBadges/DocStatusBadges.js';

interface CollectionPageProps {
  collection?: string;
}

function useDocsList(collectionId: string, options: {orderBy: string}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const firebase = useFirebase();
  const db = firebase.db;

  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';

  const listDocs = async (collectionId: string, orderBy: string) => {
    const dbCollection = collection(
      db,
      'Projects',
      projectId,
      'Collections',
      collectionId,
      'Drafts'
    );
    let dbQuery: Query = dbCollection;
    if (orderBy === 'modifiedAt') {
      dbQuery = query(dbCollection, queryOrderby('sys.modifiedAt', 'desc'));
    } else if (orderBy === 'newest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt', 'desc'));
    } else if (orderBy === 'oldest') {
      dbQuery = query(dbCollection, queryOrderby('sys.createdAt'));
    } else if (orderBy === 'slug') {
      dbQuery = query(dbCollection, queryOrderby(documentId()));
    }
    console.log('listing docs', collectionId, orderBy);
    const snapshot = await getDocs(dbQuery);
    const docs = snapshot.docs.map((d) => ({
      ...d.data(),
      id: `${collectionId}/${d.id}`,
      slug: d.id,
    }));
    console.log(collectionId, docs);
    setDocs(docs);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    listDocs(collectionId, options.orderBy);
  }, [collectionId, options.orderBy]);

  return [loading, docs] as const;
}

export function CollectionPage(props: CollectionPageProps) {
  const [query, setQuery] = useState('');

  const collectionIds = Object.keys(window.__ROOT_CTX.collections);
  const matchedCollections = collectionIds
    .filter((id) => {
      if (!query) {
        return true;
      }
      return id.toLowerCase().includes(query.toLowerCase());
    })
    .map((id) => {
      return {
        ...window.__ROOT_CTX.collections[id],
        id: id,
      };
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
                className={joinClassNames(
                  'CollectionPage__side__collection',
                  collection.id === props.collection && 'active'
                )}
                href={`/cms/content/${collection.id}`}
                key={collection.id}
              >
                <div className="CollectionPage__side__collection__icon">
                  <IconFolder size={20} strokeWidth="1.75" />
                </div>
                <div className="CollectionPage__side__collection__name">
                  {collection.id}
                </div>
                {/* {collection.name === props.collection && (
                  <div className="CollectionPage__side__collection__arrow">
                    <IconArrowBigRight strokeWidth={1.5} size={20} />
                  </div>
                )} */}
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
            <CollectionPage.Collection
              key={props.collection}
              collection={props.collection}
            />
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

interface CollectionProps {
  collection: string;
}

CollectionPage.Collection = (props: CollectionProps) => {
  const [orderBy, setOrderBy] = useLocalStorage<string>(
    `root::CollectionPage:${props.collection}:orderBy`,
    'modifiedAt'
  );
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  const collection = window.__ROOT_CTX.collections[props.collection];
  if (!collection) {
    route('/cms/content');
    return <></>;
  }

  const [loading, docs] = useDocsList(props.collection, {orderBy});

  return (
    <>
      <NewDocModal
        collection={props.collection}
        opened={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
      />
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__header">
          <div className="CollectionPage__collection__header__title">
            {collection.name}
          </div>
          {collection.description && (
            <Markdown
              className="CollectionPage__collection__header__description"
              code={collection.description}
            />
          )}
        </div>
        <Tabs className="CollectionPage__collection__tabs" active={1}>
          <Tabs.Tab label="Docs">
            <div className="CollectionPage__collection__docsTab">
              <div className="CollectionPage__collection__docsTab__controls">
                <div className="CollectionPage__collection__docsTab__controls__sort">
                  <div className="CollectionPage__collection__docsTab__controls__sort__label">
                    Sort:
                  </div>
                  <Select
                    size="xs"
                    value={orderBy}
                    onChange={(value: any) => setOrderBy(value || 'modifiedAt')}
                    data={[
                      {value: 'slug', label: 'A-Z'},
                      {value: 'newst', label: 'Newest'},
                      {value: 'oldest', label: 'Oldest'},
                      {value: 'modifiedAt', label: 'Last modified'},
                    ]}
                  />
                </div>
                <div className="CollectionPage__collection__docsTab__controls__newDoc">
                  <Button
                    color="dark"
                    size="xs"
                    leftIcon={<IconCirclePlus size={16} />}
                    onClick={() => setNewDocModalOpen(true)}
                  >
                    New
                  </Button>
                </div>
              </div>
              <div className="CollectionPage__collection__docsTab__content">
                {loading ? (
                  <div className="CollectionPage__collection__docsTab__content__loading">
                    <Loader color="gray" size="xl" />
                  </div>
                ) : (
                  <CollectionPage.DocsList
                    collection={props.collection}
                    docs={docs}
                  />
                )}
              </div>
            </div>
          </Tabs.Tab>
        </Tabs>
      </div>
    </>
  );
};

CollectionPage.DocsList = (props: {collection: string; docs: any[]}) => {
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[props.collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collectionId}`);
  }

  const docs = props.docs || [];
  if (docs.length === 0) {
    return (
      <div className="CollectionPage__collection__docsList CollectionPage__collection__docsList--empty">
        No documents in this collection yet! Get started by clicking the "New"
        button above.
      </div>
    );
  }

  function getLiveUrl(slug: string): string {
    const c = rootCollection!;
    if (!c.url) {
      return '';
    }
    const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';
    const urlPath = c.url.replace(/\[.*slug\]/, slug.replaceAll('--', '/'));
    return `${domain}${urlPath}`;
  }

  return (
    <div className="CollectionPage__collection__docsList">
      {docs.map((doc) => {
        const cmsUrl = `/cms/content/${collectionId}/${doc.slug}`;
        const liveUrl = getLiveUrl(doc.slug);
        const fields = doc.fields || {};
        const previewTitle = getNestedValue(
          fields,
          rootCollection.preview?.title || 'title'
        );
        const previewImage = getNestedValue(
          fields,
          rootCollection.preview?.image || 'image'
        );
        return (
          <div
            className="CollectionPage__collection__docsList__doc"
            key={doc.id}
          >
            <div className="CollectionPage__collection__docsList__doc__image">
              <a href={cmsUrl}>
                <Image width={120} height={90} withPlaceholder />
              </a>
            </div>
            <a
              className="CollectionPage__collection__docsList__doc__content"
              href={cmsUrl}
            >
              <div className="CollectionPage__collection__docsList__doc__content__header">
                <div className="CollectionPage__collection__docsList__doc__content__header__docId">
                  {doc.id}
                </div>
                <DocStatusBadges doc={doc} />
              </div>
              <div className="CollectionPage__collection__docsList__doc__content__title">
                {previewTitle || '[UNTITLED]'}
              </div>
              <div className="CollectionPage__collection__docsList__doc__content__url">
                {liveUrl}
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
};
