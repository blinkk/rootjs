import './CollectionPage.css';

import {Button, Loader, Select, Switch} from '@mantine/core';
import {IconCirclePlus} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DocActionsMenu} from '../../components/DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../../components/DocStatusBadges/DocStatusBadges.js';
import {FilePreview} from '../../components/FilePreview/FilePreview.js';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';
import {Surface} from '../../components/Surface/Surface.js';
import {useDocsList} from '../../hooks/useDocsList.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getNestedValue} from '../../utils/objects.js';
import {testCanEdit} from '../../utils/permissions.js';

interface CollectionPageProps {
  collection?: string;
}

export function CollectionPage(props: CollectionPageProps) {
  const {route} = useLocation();
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  usePageTitle(props.collection ? props.collection : 'Content');

  // If no collection is selected, select one by default.
  useEffect(() => {
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
  }, [props.collection, projectId]);

  const collections = window.__ROOT_CTX.collections;

  return (
    <Layout>
      <div className="CollectionPage">
        <div className="CollectionPage__layout">
          <div className="CollectionPage__side">
            {/* <div className="CollectionPage__side__title">Content</div> */}
            <CollectionTree
              collections={collections}
              activeCollectionId={props.collection}
              projectId={projectId}
            />
          </div>
          <div className="CollectionPage__main">
            {props.collection && (
              <CollectionPage.Collection
                key={props.collection}
                collection={props.collection}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface CollectionProps {
  collection: string;
}

CollectionPage.Collection = (props: CollectionProps) => {
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);

  const [orderBy, setOrderBy] = useLocalStorage<string>(
    `root::CollectionPage:${props.collection}:orderBy`,
    'modifiedAt'
  );
  const [showArchived, setShowArchived] = useLocalStorage<boolean>(
    `root::CollectionPage:${props.collection}:showArchived`,
    false
  );
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  const collection = window.__ROOT_CTX.collections[props.collection];
  if (!collection) {
    route('/cms/content');
    return <></>;
  }

  const sortOptions = [
    {value: 'slug', label: 'A-Z'},
    {value: 'slugDesc', label: 'Z-A'},
    {value: 'newest', label: 'Newest'},
    {value: 'oldest', label: 'Oldest'},
    {value: 'modifiedAt', label: 'Last modified'},
    ...(collection.sortOptions?.map((s: any) => ({
      value: s.id,
      label: s.label,
    })) || []),
  ];

  const [loading, listDocs, docs] = useDocsList(props.collection, {
    orderBy,
    includeArchived: showArchived,
  });

  return (
    <>
      <NewDocModal
        collection={props.collection}
        opened={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
      />
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__docsTab">
          {!loading && (
            <div className="CollectionPage__collection__docsTab__header">
              <div className="CollectionPage__collection__docsTab__header__title">
                {collection.name || props.collection}
              </div>
              <div className="CollectionPage__collection__docsTab__controls">
                <div className="CollectionPage__collection__docsTab__controls__showArchived">
                  <Switch
                    size="sm"
                    color="dark"
                    label="Show archived:"
                    checked={showArchived}
                    onChange={(e: any) =>
                      setShowArchived(Boolean(e.currentTarget.checked))
                    }
                  />
                </div>
                <div className="CollectionPage__collection__docsTab__controls__sort">
                  <div className="CollectionPage__collection__docsTab__controls__sort__label">
                    Sort:
                  </div>
                  <Select
                    size="xs"
                    value={orderBy}
                    onChange={(value: any) => setOrderBy(value || 'modifiedAt')}
                    data={sortOptions}
                  />
                </div>
                <div className="CollectionPage__collection__docsTab__controls__newDoc">
                  <ConditionalTooltip
                    label="You don't have access to create new documents"
                    condition={!canEdit}
                  >
                    <Button
                      color="dark"
                      size="xs"
                      leftIcon={<IconCirclePlus size={16} />}
                      onClick={() => setNewDocModalOpen(true)}
                      disabled={!canEdit}
                    >
                      New
                    </Button>
                  </ConditionalTooltip>
                </div>
              </div>
            </div>
          )}
          <Surface className="CollectionPage__collection__docsTab__content">
            {loading ? (
              <div className="CollectionPage__collection__docsTab__content__loading">
                <Loader color="gray" size="xl" />
              </div>
            ) : docs.length === 0 ? (
              <div class="CollectionPage__collection__docsEmpty">
                <div class="CollectionPage__collection__docsEmpty__title">
                  Collection is empty.
                </div>
                <div class="CollectionPage__collection__docsEmpty__button">
                  <ConditionalTooltip
                    label="You don't have access to create new documents"
                    condition={!canEdit}
                  >
                    <Button
                      color="dark"
                      size="xs"
                      leftIcon={<IconCirclePlus size={16} />}
                      onClick={() => setNewDocModalOpen(true)}
                      disabled={!canEdit}
                    >
                      New
                    </Button>
                  </ConditionalTooltip>
                </div>
              </div>
            ) : (
              <CollectionPage.DocsList
                collection={props.collection}
                docs={docs}
                reloadDocs={() => listDocs()}
              />
            )}
          </Surface>
        </div>
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
  const hasCollectionUrl = !!rootCollection.url;

  const docs = props.docs || [];
  function getLiveUrl(slug: string): string {
    if (!hasCollectionUrl) {
      return '';
    }
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
                <FilePreview
                  file={previewImage}
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
              {hasCollectionUrl && liveUrl && (
                <div className="CollectionPage__collection__docsList__doc__content__url">
                  {liveUrl}
                </div>
              )}
            </a>
            <div className="CollectionPage__collection__docsList__doc__controls">
              <DocActionsMenu
                docId={doc.id}
                data={doc}
                onAction={(e) => {
                  if (
                    e.action === 'archive' ||
                    e.action === 'copy' ||
                    e.action === 'unarchive' ||
                    e.action === 'delete' ||
                    e.action === 'unpublish' ||
                    e.action === 'locked' ||
                    e.action === 'unlocked'
                  ) {
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
