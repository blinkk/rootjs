import './CollectionPage.css';

import {
  ActionIcon,
  Button,
  Loader,
  Select,
  Switch,
  Tooltip,
} from '@mantine/core';
import {
  IconCirclePlus,
  IconChevronUp,
  IconChevronDown,
  IconLayoutList,
  IconLayoutRows,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DocActionsMenu} from '../../components/DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../../components/DocStatusBadges/DocStatusBadges.js';
import {FilePreview} from '../../components/FilePreview/FilePreview.js';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';
import {Surface} from '../../components/Surface/Surface.js';
import {UserActionTooltip} from '../../components/UserActionTooltip/UserActionTooltip.js';
import {useDocsList} from '../../hooks/useDocsList.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {getNestedValue} from '../../utils/objects.js';
import {testCanEdit} from '../../utils/permissions.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';

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

  // Collections can force the compact listing via schema
  // (`viewOptions: {compact: true}`). Otherwise the user's per-collection
  // choice is remembered in local storage.
  const forceCompactView = Boolean(collection.viewOptions?.compact);
  const [userCompactView, setUserCompactView] = useLocalStorage<boolean>(
    `root::CollectionPage:${props.collection}:compactView`,
    false
  );
  const compactView = forceCompactView || userCompactView;

  const sortOptions = [
    {value: 'slug', label: 'A-Z'},
    {value: 'slugDesc', label: 'Z-A'},
    {value: 'title', label: 'Title (A-Z)'},
    {value: 'titleDesc', label: 'Title (Z-A)'},
    {value: 'newest', label: 'Newest'},
    {value: 'oldest', label: 'Oldest'},
    {value: 'modifiedAt', label: 'Last modified'},
    {value: 'modifiedAtAsc', label: 'Least recently modified'},
    ...(collection.sortOptions?.map((s: any) => ({
      value: s.id,
      label: s.label,
    })) || []),
  ];

  const [loading, listDocs, docs] = useDocsList(props.collection, {
    orderBy,
    includeArchived: showArchived,
  });

  // Only blank the page on the very first load. Subsequent reloads (e.g. after
  // changing the sort) keep the previous docs visible and dim them with a
  // spinner overlay instead.
  const showInitialLoader = loading && docs.length === 0;
  const showEmpty = !loading && docs.length === 0;

  return (
    <>
      <NewDocModal
        collection={props.collection}
        opened={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
      />
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__docsTab">
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
              {!forceCompactView && (
                <div className="CollectionPage__collection__docsTab__controls__compact">
                  <Tooltip
                    label={
                      compactView
                        ? 'Switch to default view'
                        : 'Switch to compact view'
                    }
                    transition="pop"
                    withArrow
                  >
                    <ActionIcon
                      variant={compactView ? 'filled' : 'default'}
                      color={compactView ? 'dark' : 'gray'}
                      size={30}
                      onClick={() => setUserCompactView(!compactView)}
                      aria-label="Toggle compact view"
                    >
                      {compactView ? (
                        <IconLayoutRows size={16} />
                      ) : (
                        <IconLayoutList size={16} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                </div>
              )}
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
          <Surface className="CollectionPage__collection__docsTab__content">
            {showInitialLoader ? (
              <div className="CollectionPage__collection__docsTab__content__loading">
                <Loader color="gray" size="xl" />
              </div>
            ) : showEmpty ? (
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
              <div className="CollectionPage__collection__docsTab__content__list">
                {loading && (
                  <div className="CollectionPage__collection__docsTab__content__reloading">
                    <Loader color="gray" size="md" />
                  </div>
                )}
                <div
                  className={joinClassNames(
                    'CollectionPage__collection__docsTab__content__items',
                    loading &&
                      'CollectionPage__collection__docsTab__content__items--loading'
                  )}
                >
                  <CollectionPage.DocsList
                    collection={props.collection}
                    docs={docs}
                    compact={compactView}
                    orderBy={orderBy}
                    onSort={setOrderBy}
                    reloadDocs={() => listDocs()}
                  />
                </div>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </>
  );
};

/**
 * Maps a sortable compact-table column to the `orderBy` values used by the
 * sort dropdown / `useDocsList`. `defaultDir` is applied the first time a column
 * is activated; subsequent clicks toggle between asc and desc.
 */
const COLUMN_SORTS: Record<
  string,
  {asc: string; desc: string; defaultDir: 'asc' | 'desc'}
> = {
  id: {asc: 'slug', desc: 'slugDesc', defaultDir: 'asc'},
  title: {asc: 'title', desc: 'titleDesc', defaultDir: 'asc'},
  created: {asc: 'oldest', desc: 'newest', defaultDir: 'desc'},
  modified: {asc: 'modifiedAtAsc', desc: 'modifiedAt', defaultDir: 'desc'},
};

/** Returns the active sort direction for a column, or null when inactive. */
function getColumnSortDir(
  column: string,
  orderBy?: string
): 'asc' | 'desc' | null {
  const cfg = COLUMN_SORTS[column];
  if (!cfg || !orderBy) {
    return null;
  }
  if (orderBy === cfg.asc) {
    return 'asc';
  }
  if (orderBy === cfg.desc) {
    return 'desc';
  }
  return null;
}

/** A clickable compact-table header cell that toggles the sort order. */
function SortableHeaderCell(props: {
  column: string;
  label: string;
  orderBy?: string;
  onSort?: (orderBy: string) => void;
}) {
  const cfg = COLUMN_SORTS[props.column];
  const dir = getColumnSortDir(props.column, props.orderBy);
  const active = dir !== null;

  function onClick() {
    if (!props.onSort) {
      return;
    }
    let nextDir: 'asc' | 'desc';
    if (dir === 'asc') {
      nextDir = 'desc';
    } else if (dir === 'desc') {
      nextDir = 'asc';
    } else {
      nextDir = cfg.defaultDir;
    }
    props.onSort(cfg[nextDir]);
  }

  return (
    <button
      type="button"
      className={joinClassNames(
        'CollectionPage__collection__docsList__header__cell',
        'CollectionPage__collection__docsList__header__cell--sortable',
        active && 'CollectionPage__collection__docsList__header__cell--active'
      )}
      onClick={onClick}
      aria-label={`Sort by ${props.label}`}
    >
      <span>{props.label}</span>
      {active &&
        (dir === 'asc' ? (
          <IconChevronUp size={12} stroke={2.5} />
        ) : (
          <IconChevronDown size={12} stroke={2.5} />
        ))}
    </button>
  );
}

CollectionPage.DocsList = (props: {
  collection: string;
  docs: any[];
  compact?: boolean;
  orderBy?: string;
  onSort?: (orderBy: string) => void;
  reloadDocs: () => void;
}) => {
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[props.collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collectionId}`);
  }
  const hasCollectionUrl = !!rootCollection.url;
  const compact = !!props.compact;

  const docs = props.docs || [];
  function getLiveUrl(slug: string): string {
    if (!hasCollectionUrl) {
      return '';
    }
    return getDocServingUrl({collectionId, slug});
  }

  function onDocAction(e: {action: string}) {
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
  }

  if (compact) {
    return (
      <div className="CollectionPage__collection__docsList__scroll">
        <div className="CollectionPage__collection__docsList CollectionPage__collection__docsList--compact">
          <div className="CollectionPage__collection__docsList__header">
            <div className="CollectionPage__collection__docsList__header__image" />
            <SortableHeaderCell
              column="id"
              label="ID"
              orderBy={props.orderBy}
              onSort={props.onSort}
            />
            <SortableHeaderCell
              column="title"
              label="Title"
              orderBy={props.orderBy}
              onSort={props.onSort}
            />
            <div className="CollectionPage__collection__docsList__header__cell">
              Status
            </div>
            <SortableHeaderCell
              column="created"
              label="Created"
              orderBy={props.orderBy}
              onSort={props.onSort}
            />
            <SortableHeaderCell
              column="modified"
              label="Modified"
              orderBy={props.orderBy}
              onSort={props.onSort}
            />
            <div className="CollectionPage__collection__docsList__header__controls" />
          </div>
          {docs.map((doc) => {
            const cmsUrl = `/cms/content/${collectionId}/${doc.slug}`;
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
                <a
                  className="CollectionPage__collection__docsList__doc__image"
                  href={cmsUrl}
                >
                  <FilePreview
                    file={previewImage}
                    width={48}
                    height={36}
                    withPlaceholder={!previewImage?.src}
                  />
                </a>
                <a
                  className="CollectionPage__collection__docsList__doc__docId"
                  href={cmsUrl}
                >
                  {doc.id}
                </a>
                <a
                  className="CollectionPage__collection__docsList__doc__title"
                  href={cmsUrl}
                >
                  {previewTitle || '[UNTITLED]'}
                </a>
                <div className="CollectionPage__collection__docsList__doc__badges">
                  <DocStatusBadges doc={doc} />
                </div>
                <div className="CollectionPage__collection__docsList__doc__timestamp">
                  {renderTimestamp(doc?.sys?.createdAt, doc?.sys?.createdBy)}
                </div>
                <div className="CollectionPage__collection__docsList__doc__timestamp">
                  {renderTimestamp(doc?.sys?.modifiedAt, doc?.sys?.modifiedBy)}
                </div>
                <div className="CollectionPage__collection__docsList__doc__controls">
                  <DocActionsMenu
                    docId={doc.id}
                    data={doc}
                    onAction={onDocAction}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
                onAction={onDocAction}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Renders a relative timestamp (e.g. "3d ago") for the compact docs list.
 * Returns an em dash when the timestamp is missing. A tooltip shows the full
 * date and the user who performed the action (with their avatar) when
 * available.
 */
function renderTimestamp(ts: any, by?: string) {
  if (!ts || typeof ts.toMillis !== 'function') {
    return (
      <span className="CollectionPage__collection__docsList__doc__timestamp__value">
        —
      </span>
    );
  }
  return (
    <UserActionTooltip message={formatDateTime(ts)} user={by}>
      <span className="CollectionPage__collection__docsList__doc__timestamp__value">
        {getTimeAgo(ts.toMillis())}
      </span>
    </UserActionTooltip>
  );
}
