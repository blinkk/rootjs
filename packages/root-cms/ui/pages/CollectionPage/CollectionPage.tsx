import './CollectionPage.css';

import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  ActionIcon,
  Button,
  Loader,
  Menu,
  Select,
  Switch,
  Tooltip,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconBaselineDensityMedium,
  IconBaselineDensitySmall,
  IconCheck,
  IconChevronUp,
  IconChevronDown,
  IconCirclePlus,
  IconGripVertical,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  generateKeyBetween,
  generateNKeysBetween,
} from '../../../shared/sort-key.js';
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
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingUrl} from '../../utils/doc-urls.js';
import {
  cmsAssignSortKeys,
  cmsSetDocSortKey,
  fetchMaxSortKey,
  testPublishingLocked,
} from '../../utils/doc.js';
import {getNestedValue} from '../../utils/objects.js';
import {testCanEdit} from '../../utils/permissions.js';
import {formatDateTime, getTimeAgo} from '../../utils/time.js';

/** Document listing density. */
type Density = 'comfortable' | 'compact';

const DENSITY_OPTIONS: Array<{
  value: Density;
  label: string;
  Icon: typeof IconBaselineDensityMedium;
}> = [
  {value: 'comfortable', label: 'Comfortable', Icon: IconBaselineDensityMedium},
  {value: 'compact', label: 'Compact', Icon: IconBaselineDensitySmall},
];

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

  const collection = window.__ROOT_CTX.collections[props.collection];
  const manualSortingEnabled = Boolean(collection?.manualSorting);

  const [orderBy, setOrderBy] = useLocalStorage<string>(
    `root::CollectionPage:${props.collection}:orderBy`,
    manualSortingEnabled ? 'manual' : 'modifiedAt'
  );
  const [showArchived, setShowArchived] = useLocalStorage<boolean>(
    `root::CollectionPage:${props.collection}:showArchived`,
    false
  );
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);

  if (!collection) {
    route('/cms/content');
    return <></>;
  }

  // Guard against a stale "manual" value in localStorage (e.g. when the
  // collection's `manualSorting` option is later removed from the schema).
  const effectiveOrderBy =
    orderBy === 'manual' && !manualSortingEnabled ? 'modifiedAt' : orderBy;

  // Collections can force the compact listing via schema
  // (`viewOptions: {compact: true}`). Otherwise the user's chosen density is
  // remembered globally (sticky as the user navigates between collections).
  const forceCompactView = Boolean(collection.viewOptions?.compact);
  const [userDensity, setUserDensity] = useLocalStorage<Density>(
    'root::CollectionPage:density',
    'comfortable'
  );
  const density: Density = forceCompactView ? 'compact' : userDensity;
  const compactView = density === 'compact';

  const sortOptions = [
    ...(manualSortingEnabled ? [{value: 'manual', label: 'Manual order'}] : []),
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

  const [loading, listDocs, docs, setDocs] = useDocsList(props.collection, {
    orderBy: effectiveOrderBy,
    includeArchived: showArchived,
  });

  const manualMode = effectiveOrderBy === 'manual';
  const keylessCount = manualMode
    ? docs.filter((doc: any) => !doc.sys?.sortKey).length
    : 0;

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
                  value={effectiveOrderBy}
                  onChange={(value: any) => setOrderBy(value || 'modifiedAt')}
                  data={sortOptions}
                />
              </div>
              <DensityControl
                density={density}
                locked={forceCompactView}
                onChange={setUserDensity}
              />
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
          {manualMode && !loading && keylessCount > 0 && canEdit && (
            <AssignPositionsBanner
              collectionId={props.collection}
              docs={docs}
              keylessCount={keylessCount}
              onAssigned={() => listDocs()}
            />
          )}
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
                    orderBy={effectiveOrderBy}
                    onSort={setOrderBy}
                    reloadDocs={() => listDocs()}
                    reorderable={manualMode && canEdit}
                    onDocsChange={setDocs}
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
 * The "View:" density control. Renders a labeled icon button that opens a menu
 * for choosing the listing density (Comfortable / Compact). The choice is
 * sticky across collections (persisted by the caller). When `locked` is true
 * (the collection forces compact via `viewOptions.compact`), the control is
 * disabled and the menu is not shown.
 */
function DensityControl(props: {
  density: Density;
  locked?: boolean;
  onChange: (density: Density) => void;
}) {
  const active =
    DENSITY_OPTIONS.find((option) => option.value === props.density) ||
    DENSITY_OPTIONS[0];
  const ActiveIcon = active.Icon;
  const control = (
    <ActionIcon
      variant="default"
      color="gray"
      size={30}
      disabled={props.locked}
      aria-label="Change view density"
    >
      <ActiveIcon size={16} />
    </ActionIcon>
  );
  return (
    <div className="CollectionPage__collection__docsTab__controls__density">
      <div className="CollectionPage__collection__docsTab__controls__density__label">
        View:
      </div>
      {props.locked ? (
        <Tooltip
          label="This collection is locked to the compact view"
          transition="pop"
          withArrow
        >
          {control}
        </Tooltip>
      ) : (
        <Menu position="bottom" placement="end" control={control}>
          <Menu.Label>View density</Menu.Label>
          {DENSITY_OPTIONS.map((option) => {
            const OptionIcon = option.Icon;
            const isActive = option.value === props.density;
            return (
              <Menu.Item
                key={option.value}
                icon={<OptionIcon size={18} />}
                rightSection={
                  isActive ? <IconCheck size={14} stroke={2.5} /> : undefined
                }
                onClick={() => props.onChange(option.value)}
              >
                {option.label}
              </Menu.Item>
            );
          })}
        </Menu>
      )}
    </div>
  );
}

/**
 * Maps a sortable compact-table column to the `orderBy` values used by the
 * sort dropdown / `useDocsList`. `defaultDir` is applied the first time a column
 * is activated; subsequent clicks toggle between asc and desc.
 */
const COLUMN_SORTS: Record<
  string,
  {asc: string; desc: string; defaultDir: 'asc' | 'desc'}
> = {
  slug: {asc: 'slug', desc: 'slugDesc', defaultDir: 'asc'},
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

/**
 * Counts the status badges DocStatusBadges would render for a doc. Used to size
 * the Status column so the busiest row's pills aren't truncated. A doc in one
 * or more releases adds a single release badge (multiple releases collapse into
 * one "N releases" badge).
 */
function countStatusBadges(doc: any, releaseCount: number): number {
  const sys = doc?.sys || {};
  let count = 0;
  if (!sys.publishedAt || !sys.modifiedAt || sys.modifiedAt > sys.publishedAt) {
    count++; // Draft
  }
  if (sys.publishedAt) {
    count++; // Published
  }
  if (sys.scheduledAt) {
    count++; // Scheduled
  }
  if (testPublishingLocked(doc)) {
    count++; // Locked
  }
  if (sys.archivedAt) {
    count++; // Archived
  }
  if (releaseCount > 0) {
    count++; // Release (single badge regardless of release count)
  }
  return count;
}

/**
 * Banner shown in the "Manual order" view when some docs don't have a
 * `sys.sortKey` yet (docs created before the collection's `manualSorting`
 * option was enabled, or docs created by import scripts). Offers a one-click
 * action that appends positions for those docs — in the currently displayed
 * order — after the current max sort key. This also serves as the one-time
 * initialization when enabling manual sorting on an existing collection.
 */
function AssignPositionsBanner(props: {
  collectionId: string;
  docs: any[];
  keylessCount: number;
  onAssigned: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function assignPositions() {
    setLoading(true);
    try {
      // `props.docs` is already in display order (keyed docs first, keyless
      // docs at the end), so assignment preserves what the editor sees.
      const keyless = props.docs.filter((doc: any) => !doc.sys?.sortKey);
      // Append after the true max key in the db (hidden archived docs may
      // hold a larger key than any doc in the current view).
      const maxKey = await fetchMaxSortKey(props.collectionId);
      const keys = generateNKeysBetween(maxKey, null, keyless.length);
      await cmsAssignSortKeys(
        keyless.map((doc: any, i: number) => ({
          docId: doc.id,
          sortKey: keys[i],
        }))
      );
      showNotification({
        title: 'Assigned positions',
        message: `Assigned positions to ${keyless.length} doc(s).`,
        autoClose: 5000,
      });
      props.onAssigned();
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Failed to assign positions',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="CollectionPage__collection__assignPositions">
      <div className="CollectionPage__collection__assignPositions__text">
        <b>
          {props.keylessCount === 1
            ? '1 doc has no manual position.'
            : `${props.keylessCount} docs have no manual position.`}
        </b>{' '}
        Unpositioned docs are shown at the end of the list and are excluded from
        API results ordered by <code>sys.sortKey</code>.
      </div>
      <Button
        size="xs"
        color="dark"
        loading={loading}
        onClick={() => assignPositions()}
      >
        Assign positions
      </Button>
    </div>
  );
}

/**
 * Wraps the docs list in a drag-and-drop context when reordering is enabled
 * ("Manual order" sort + edit permission); otherwise renders a plain div so
 * the list markup stays identical.
 */
function ReorderableList(props: {
  enabled?: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  className?: string;
  style?: any;
  children: ComponentChildren;
}) {
  if (!props.enabled) {
    return (
      <div className={props.className} style={props.style}>
        {props.children}
      </div>
    );
  }
  return (
    <DragDropContext
      onDragEnd={(result: DropResult) => {
        const {source, destination} = result;
        if (!destination || destination.index === source.index) {
          return;
        }
        props.onReorder(source.index, destination.index);
      }}
    >
      <Droppable
        droppableId="CollectionPage__docsList__droppable"
        direction="vertical"
      >
        {(provided: any) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={props.className}
            style={props.style}
          >
            {props.children}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

/**
 * A doc row in the docs list. When reordering is enabled, the row is
 * draggable and renders a grip handle as its first cell (the handle also
 * supports keyboard dragging: tab to it, then space + arrow keys).
 */
function ReorderableRow(props: {
  enabled?: boolean;
  draggableId: string;
  index: number;
  children: ComponentChildren;
}) {
  const className = 'CollectionPage__collection__docsList__doc';
  if (!props.enabled) {
    return <div className={className}>{props.children}</div>;
  }
  return (
    <Draggable draggableId={props.draggableId} index={props.index}>
      {(provided: any, snapshot: any) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={joinClassNames(
            className,
            snapshot.isDragging &&
              'CollectionPage__collection__docsList__doc--dragging'
          )}
        >
          <div
            className="CollectionPage__collection__docsList__doc__handle"
            {...provided.dragHandleProps}
            aria-label="Reorder doc"
          >
            <IconGripVertical size={16} stroke="1.5" />
          </div>
          {props.children}
        </div>
      )}
    </Draggable>
  );
}

CollectionPage.DocsList = (props: {
  collection: string;
  docs: any[];
  compact?: boolean;
  orderBy?: string;
  onSort?: (orderBy: string) => void;
  reloadDocs: () => void;
  /** Enables drag-to-reorder (the "Manual order" sort mode). */
  reorderable?: boolean;
  /** Called with the updated docs array after an optimistic reorder. */
  onDocsChange?: (docs: any[]) => void;
}) => {
  const collectionId = props.collection;
  const rootCollection = window.__ROOT_CTX.collections[props.collection];
  if (!rootCollection) {
    throw new Error(`could not find collection: ${collectionId}`);
  }
  const hasCollectionUrl = !!rootCollection.url;
  const compact = !!props.compact;

  const docs = props.docs || [];
  const {getReleasesForDoc} = usePendingReleases();
  // Widen the Status column to fit the row with the most status badges (a
  // published doc with newer edits + a scheduled publish + a lock + a release
  // can stack several pills, which overflow the default width).
  const maxStatusBadges = compact
    ? docs.reduce(
        (max, doc) =>
          Math.max(
            max,
            countStatusBadges(doc, getReleasesForDoc(doc.id).length)
          ),
        1
      )
    : 1;
  const statusColumnWidth =
    maxStatusBadges <= 1 ? 80 : maxStatusBadges === 2 ? 150 : 215;
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

  const reorderable = !!props.reorderable;

  /**
   * Moves a doc to a new position in the manual order (used by drag-and-drop
   * and the "Move to top/bottom" menu actions). Updates the list optimistically
   * and persists the new `sys.sortKey`.
   */
  async function handleReorder(fromIndex: number, toIndex: number) {
    if (
      !props.onDocsChange ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= docs.length
    ) {
      return;
    }
    toIndex = Math.max(0, Math.min(docs.length - 1, toIndex));
    const next = [...docs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    try {
      if (next.every((doc: any) => doc.sys?.sortKey)) {
        let newKey: string | null = null;
        try {
          const prevKey = next[toIndex - 1]?.sys?.sortKey ?? null;
          const nextKey = next[toIndex + 1]?.sys?.sortKey ?? null;
          newKey = generateKeyBetween(prevKey, nextKey);
        } catch (err) {
          // Duplicate or malformed neighbor keys (e.g. from concurrent
          // editors) can make it impossible to generate a key between two
          // docs. Fall through to renormalizing the whole list.
          console.error('failed to generate sort key', err);
        }
        if (newKey) {
          next[toIndex] = {...moved, sys: {...moved.sys, sortKey: newKey}};
          props.onDocsChange(next);
          await cmsSetDocSortKey(moved.id, newKey);
          return;
        }
      }
      // Some docs have no sort key yet (or neighbor keys collided):
      // renormalize by assigning fresh, evenly-spaced keys to every doc in
      // the current display order.
      const keys = generateNKeysBetween(null, null, next.length);
      const renormalized = next.map((doc: any, i: number) => ({
        ...doc,
        sys: {...doc.sys, sortKey: keys[i]},
      }));
      props.onDocsChange(renormalized);
      await cmsAssignSortKeys(
        renormalized.map((doc: any) => ({
          docId: doc.id,
          sortKey: doc.sys.sortKey,
        }))
      );
    } catch (err) {
      console.error('failed to reorder doc', err);
      showNotification({
        title: 'Failed to reorder',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      props.reloadDocs();
    }
  }

  if (compact) {
    return (
      <ReorderableList
        enabled={reorderable}
        onReorder={handleReorder}
        className={joinClassNames(
          'CollectionPage__collection__docsList',
          'CollectionPage__collection__docsList--compact',
          reorderable && 'CollectionPage__collection__docsList--reorderable'
        )}
        style={{['--docs-status-width' as any]: `${statusColumnWidth}px`}}
      >
        <div className="CollectionPage__collection__docsList__header">
          {reorderable && (
            <div className="CollectionPage__collection__docsList__header__handle" />
          )}
          <div className="CollectionPage__collection__docsList__header__image" />
          <SortableHeaderCell
            column="slug"
            label="Slug"
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
        {docs.map((doc, index) => {
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
            <ReorderableRow
              key={doc.id}
              enabled={reorderable}
              draggableId={doc.id}
              index={index}
            >
              <a
                className="CollectionPage__collection__docsList__doc__image"
                href={cmsUrl}
              >
                <FilePreview
                  file={previewImage}
                  width={40}
                  height={30}
                  withPlaceholder={!previewImage?.src}
                />
              </a>
              <a
                className="CollectionPage__collection__docsList__doc__docId"
                href={cmsUrl}
              >
                {doc.slug}
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
                  onMoveTo={
                    reorderable
                      ? (position) =>
                          handleReorder(
                            index,
                            position === 'top' ? 0 : docs.length - 1
                          )
                      : undefined
                  }
                />
              </div>
            </ReorderableRow>
          );
        })}
      </ReorderableList>
    );
  }

  return (
    <ReorderableList
      enabled={reorderable}
      onReorder={handleReorder}
      className="CollectionPage__collection__docsList"
    >
      {docs.map((doc, index) => {
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
          <ReorderableRow
            key={doc.id}
            enabled={reorderable}
            draggableId={doc.id}
            index={index}
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
                onMoveTo={
                  reorderable
                    ? (position) =>
                        handleReorder(
                          index,
                          position === 'top' ? 0 : docs.length - 1
                        )
                    : undefined
                }
              />
            </div>
          </ReorderableRow>
        );
      })}
    </ReorderableList>
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
