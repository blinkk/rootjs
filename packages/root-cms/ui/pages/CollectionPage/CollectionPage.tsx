import {Button, Image, Loader, Select, Tabs} from '@mantine/core';
import {
  IconArrowRoundaboutRight,
  IconCirclePlus,
  IconFolder,
} from '@tabler/icons-preact';

import {useEffect, useState} from 'preact/hooks';
import {route} from 'preact-router';

import {DocActionsMenu} from '../../components/DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../../components/DocStatusBadges/DocStatusBadges.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Markdown} from '../../components/Markdown/Markdown.js';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {useDocsList} from '../../hooks/useDocsList.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getNestedValue} from '../../utils/objects.js';
import './CollectionPage.css';

interface CollectionPageProps {
  collection?: string;
}

export function CollectionPage(props: CollectionPageProps) {
  const [query, setQuery] = useState('');

  // If no collection is selected, select one by default.
  useEffect(() => {
    const projectId = window.__ROOT_CTX.rootConfig.projectId;
    const collections = window.__ROOT_CTX.collections;
    const localStorageKey = `root-cms::${projectId}::last_collection`;
    if (props.collection) {
      // Store the current collection in local storage.
      window.localStorage.setItem(localStorageKey, props.collection);
    } else {
      // Route to the last visited collection.
      const lastVisited = window.localStorage.getItem(localStorageKey);
      if (lastVisited && collections[lastVisited]) {
        route(`/cms/content/${lastVisited}`);
        return;
      }
      // Default to a collection called "Pages" if it exists.
      if (window.__ROOT_CTX.collections['Pages']) {
        route('/cms/content/Pages');
        return;
      }
      const collectionIds = Object.keys(window.__ROOT_CTX.collections) || [];
      if (collectionIds.length > 0) {
        const firstCollectionId = collectionIds[0];
        route(`/cms/content/${firstCollectionId}`);
        return;
      }
      console.warn('no collections');
    }
  }, [props.collection]);

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
          <div className="CollectionPage__side__title">Content</div>
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
                  {collection.name || collection.id}
                </div>
                {collection.description && (
                  <div className="CollectionPage__side__collection__desc">
                    {collection.description}
                  </div>
                )}
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
              <IconArrowRoundaboutRight size={24} strokeWidth={1.75} />
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

  const [loading, listDocs, docs] = useDocsList(props.collection, {orderBy});

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
              {!loading && docs.length > 0 && (
                <div className="CollectionPage__collection__docsTab__header">
                  <Heading className="CollectionPage__collection__docsTab__header__title">
                    {collection.name || props.collection}
                  </Heading>
                  <div className="CollectionPage__collection__docsTab__controls">
                    <div className="CollectionPage__collection__docsTab__controls__sort">
                      <div className="CollectionPage__collection__docsTab__controls__sort__label">
                        Sort:
                      </div>
                      <Select
                        size="xs"
                        value={orderBy}
                        onChange={(value: any) =>
                          setOrderBy(value || 'modifiedAt')
                        }
                        data={[
                          {value: 'slug', label: 'A-Z'},
                          {value: 'newest', label: 'Newest'},
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
                </div>
              )}
              <div className="CollectionPage__collection__docsTab__content">
                {loading ? (
                  <div className="CollectionPage__collection__docsTab__content__loading">
                    <Loader color="gray" size="xl" />
                  </div>
                ) : docs.length === 0 ? (
                  <div class="CollectionPage__collection__docsEmpty">
                    <div class="CollectionPage__collection__docsEmpty__icon">
                      <EmptyDocsImage />
                    </div>
                    <div class="CollectionPage__collection__docsEmpty__title">
                      Collection is empty.
                    </div>
                    <div class="CollectionPage__collection__docsEmpty__button">
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
                ) : (
                  <CollectionPage.DocsList
                    collection={props.collection}
                    docs={docs}
                    reloadDocs={() => listDocs()}
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

CollectionPage.DocsList = (props: {
  collection: string;
  docs: any[];
  reloadDocs: () => void;
}) => {
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[props.collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collectionId}`);
  }

  const docs = props.docs || [];
  function getLiveUrl(slug: string): string {
    return getDocServingUrl({collectionId, slug});
  }

  return (
    <div className="CollectionPage__collection__docsList">
      {docs.map((doc) => {
        const cmsUrl = `/cms/content/${collectionId}/${doc.slug}`;
        const liveUrl = getLiveUrl(doc.slug);
        const fields = doc.fields || {};
        const previewTitle = getNestedValue(
          fields,
          rootCollection.preview?.title || 'meta.title'
        );
        const previewImage =
          getNestedValue(
            fields,
            rootCollection.preview?.image || 'meta.image'
          ) || rootCollection.preview?.defaultImage;
        return (
          <div
            className="CollectionPage__collection__docsList__doc"
            key={doc.id}
          >
            <div className="CollectionPage__collection__docsList__doc__image">
              <a href={cmsUrl}>
                <Image
                  src={previewImage?.src}
                  width={120}
                  height={90}
                  withPlaceholder={!previewImage?.src}
                />
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
            <div className="CollectionPage__collection__docsList__doc__controls">
              <DocActionsMenu
                docId={doc.id}
                data={doc}
                onAction={(e) => {
                  if (e.action === 'delete' || e.action === 'unpublish') {
                    props.reloadDocs();
                  }
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

function EmptyDocsImage() {
  return (
    <svg
      width="165"
      height="142"
      viewBox="0 0 165 142"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M85.3227 123.613C119.114 123.613 146.509 96.2184 146.509 62.3067C146.509 28.3949 118.993 1 85.3227 1C51.5316 1 24.1367 28.3949 24.1367 62.3067C24.1367 96.2184 51.5316 123.613 85.3227 123.613Z"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M154.276 42.8823C157.009 42.8823 159.224 40.667 159.224 37.9343C159.224 35.2016 157.009 32.9863 154.276 32.9863C151.543 32.9863 149.328 35.2016 149.328 37.9343C149.328 40.667 151.543 42.8823 154.276 42.8823Z"
        fill="#f5f5f5"
      />
      <path
        d="M161.516 23.5733C163.383 23.5733 164.895 22.0604 164.895 20.1942C164.895 18.3279 163.383 16.8151 161.516 16.8151C159.65 16.8151 158.137 18.3279 158.137 20.1942C158.137 22.0604 159.65 23.5733 161.516 23.5733Z"
        fill="#f5f5f5"
      />
      <path
        d="M26.9123 22.1192C28.7785 22.1192 30.2914 20.6064 30.2914 18.7401C30.2914 16.8739 28.7785 15.361 26.9123 15.361C25.0461 15.361 23.5332 16.8739 23.5332 18.7401C23.5332 20.6064 25.0461 22.1192 26.9123 22.1192Z"
        fill="#f5f5f5"
      />
      <path
        d="M6.27549 87.288C9.74134 87.288 12.551 84.4784 12.551 81.0126C12.551 77.5467 9.74134 74.7371 6.27549 74.7371C2.80963 74.7371 0 77.5467 0 81.0126C0 84.4784 2.80963 87.288 6.27549 87.288Z"
        fill="#f5f5f5"
      />
      <path
        d="M121.099 107.854H138.619C140.82 107.854 142.706 105.969 142.706 103.769V22.0726C142.706 19.873 140.82 17.9877 138.619 17.9877H121.643"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M51.5361 107.854H34.5596C32.3589 107.854 30.4727 105.969 30.4727 103.769V22.0726C30.4727 19.873 32.3589 17.9877 34.5596 17.9877H51.1864"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M42.2832 34.327H50.7714"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M42.2832 45.3246H50.7714"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M42.2832 56.6365H50.7714"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M42.2832 67.9485H50.7714"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M42.2832 89.9436H50.7714"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M129.816 34.327H121.643"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M129.816 45.3246H121.643"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M129.816 56.6365H121.643"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M129.816 67.9485H121.643"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M129.816 89.9436H121.643"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
        stroke-linecap="round"
      />
      <path
        d="M117.556 114.767H55.3086C53.108 114.767 51.2217 112.881 51.2217 110.682V15.7883C51.2217 13.5888 53.108 11.7035 55.3086 11.7035H117.556C119.756 11.7035 121.643 13.5888 121.643 15.7883V110.682C121.643 112.881 119.756 114.767 117.556 114.767Z"
        fill="white"
        stroke="#e5e5e5"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M110.01 42.4468H66.6261C65.683 42.4468 65.0542 41.8773 65.0542 41.0231V37.3217C65.0542 36.4675 65.683 35.898 66.6261 35.898H110.01C110.954 35.898 111.582 36.4675 111.582 37.3217V41.0231C111.582 41.5926 110.954 42.4468 110.01 42.4468Z"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M110.01 59.4146H66.6261C65.683 59.4146 65.0542 58.8451 65.0542 57.9909V54.2894C65.0542 53.4352 65.683 52.8658 66.6261 52.8658H110.01C110.954 52.8658 111.582 53.4352 111.582 54.2894V57.9909C111.582 58.8451 110.954 59.4146 110.01 59.4146Z"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M110.01 76.6964H66.6261C65.683 76.6964 65.0542 76.127 65.0542 75.2728V71.5713C65.0542 70.7171 65.683 70.1476 66.6261 70.1476H110.01C110.954 70.1476 111.582 70.7171 111.582 71.5713V75.2728C111.582 76.127 110.954 76.6964 110.01 76.6964Z"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M110.011 94.2926H92.7198C91.7767 94.2926 91.1479 93.7231 91.1479 92.8689V89.1674C91.1479 88.3132 91.7767 87.7438 92.7198 87.7438H110.011C110.954 87.7438 111.583 88.3132 111.583 89.1674V92.8689C111.583 93.7231 110.954 94.2926 110.011 94.2926Z"
        fill="#f5f5f5"
        stroke="#d4d4d4"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M105.548 125.569C105.155 127.237 104.566 129.003 103.879 130.475C102.015 134.106 99.0712 136.952 95.4405 138.816C91.7116 140.681 87.2959 141.466 82.8801 140.484C72.4786 138.326 65.8059 128.12 67.9647 117.719C70.1235 107.317 80.2307 100.546 90.6322 102.803C94.3611 103.588 97.5993 105.453 100.347 108.004C104.959 112.616 106.921 119.289 105.548 125.569Z"
        fill="#d4d4d4"
        stroke="#a3a3a3"
        stroke-width="2"
        stroke-miterlimit="10"
      />
      <path
        d="M92.8892 118.976H89.4735V115.56C89.4735 114.163 88.377 112.892 86.8053 112.892C85.4087 112.892 84.1371 113.988 84.1371 115.56V118.976H80.7214C79.3248 118.976 78.0532 120.072 78.0532 121.644C78.0532 122.374 78.3129 123.054 78.8122 123.553C79.3116 124.052 79.9912 124.312 80.7214 124.312H84.1371V127.728C84.1371 129.124 85.2337 130.396 86.8053 130.396C88.2019 130.396 89.4735 129.299 89.4735 127.728V124.312H92.8892C94.2858 124.312 95.5574 123.215 95.5574 121.644C95.5574 120.072 94.2858 118.976 92.8892 118.976Z"
        fill="white"
        stroke="#a3a3a3"
        stroke-width="2"
      />
    </svg>
  );
}
