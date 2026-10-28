import './CollectionPage.css';

import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  IconBaselineDensityMedium,
  IconBaselineDensitySmall,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCirclePlus,
  IconFolder,
  IconGripVertical,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {ComponentChildren} from 'preact';
import {useEffect, useId, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  generateKeyBetween,
  generateNKeysBetween,
} from '../../../../../shared/sort-key.js';
import {Layout} from '../../../../app/layout/Layout.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {FilePreview} from '../../../../components/FilePreview/FilePreview.js';
import {Surface} from '../../../../components/Surface/Surface.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuGroup, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Switch} from '../../../../primitives/Switch/Switch.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {getNestedValue} from '../../../../utils/objects.js';
import {formatDateTime, getTimeAgo} from '../../../../utils/time.js';
import {DocActionsMenu} from '../../../documents/components/DocActionsMenu/DocActionsMenu.js';
import {DocStatusBadges} from '../../../documents/components/DocStatusBadges/DocStatusBadges.js';
import {getDocServingUrl} from '../../../documents/doc-urls.js';
import {
  cmsAssignSortKeys,
  cmsSetDocSortKey,
  fetchMaxSortKey,
  testPublishingLocked,
} from '../../../documents/doc.js';
import {usePendingReleases} from '../../../releases/usePendingReleases.js';
import {testCanEdit} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserActionTooltip} from '../../../users/UserActionTooltip/UserActionTooltip.js';
import {CollectionTree} from '../../components/CollectionTree/CollectionTree.js';
import {NewDocModal} from '../../components/NewDocModal/NewDocModal.js';
import {Density, useDensity} from '../../useDensity.js';
import {useDocsList} from '../../useDocsList.js';

const DENSITY_OPTIONS: Array<{
  value: Density;
  label: string;
  Icon: typeof IconBaselineDensityMedium;
}> = [
  {value: 'comfortable', label: 'Comfortable', Icon: IconBaselineDensityMedium},
  {value: 'compact', label: 'Compact', Icon: IconBaselineDensitySmall},
];

/** Explains why the "New" doc buttons are disabled. */
const NEW_DOC_TOOLTIP = "You don't have access to create new documents";

interface CollectionPageProps {
  collection?: string;
}

/**
 * The content page: the collection tree beside the selected collection's
 * docs. Below `lg` the tree collapses behind a toggle above the docs.
 */
export function CollectionPage(props: CollectionPageProps) {
  const {route} = useLocation();
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  usePageTitle(props.collection ? props.collection : 'Content');
  const [treeOpen, setTreeOpen] = useState(false);
  const treeId = useId();

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

  // Collapse the (mobile) tree after picking a collection.
  useEffect(() => setTreeOpen(false), [props.collection]);

  const collections = window.__ROOT_CTX.collections;

  return (
    <Layout>
      <div className="CollectionPage bg-page lg:flex">
        <div className="CollectionPage__side px-4 pt-4 md:px-8 md:pt-8 lg:h-full lg:w-70 lg:shrink-0 lg:overflow-y-auto lg:pb-8 lg:pr-0 2xl:w-100">
          <button
            type="button"
            className="CollectionPage__side__toggle m-0 flex w-full cursor-pointer appearance-none items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left font-sans text-base font-medium text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
            aria-expanded={treeOpen}
            aria-controls={treeId}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <IconFolder size={16} strokeWidth="1.75" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Collections</span>
            <IconChevronDown
              size={16}
              aria-hidden="true"
              className={cn(
                'shrink-0 text-muted transition-transform',
                treeOpen && 'rotate-180'
              )}
            />
          </button>
          <div
            id={treeId}
            className={cn(
              'CollectionPage__side__tree mt-2 lg:mt-0 lg:block',
              !treeOpen && 'hidden'
            )}
          >
            <CollectionTree
              collections={collections}
              activeCollectionId={props.collection}
              projectId={projectId}
            />
          </div>
        </div>
        <div className="CollectionPage__main min-w-0 flex-1 px-4 pt-4 md:px-8 md:pt-8 lg:h-full lg:overflow-y-auto">
          {props.collection && (
            <CollectionPage.Collection
              key={props.collection}
              collection={props.collection}
            />
          )}
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
  const customSortingEnabled = Boolean(collection?.customSorting);

  const [orderBy, setOrderBy] = useLocalStorage<string>(
    `root::CollectionPage:${props.collection}:orderBy`,
    customSortingEnabled ? 'custom' : 'modifiedAt'
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
  // collection's `customSorting` option is later removed from the schema).
  const effectiveOrderBy =
    orderBy === 'custom' && !customSortingEnabled ? 'modifiedAt' : orderBy;

  // Collections can force the compact listing via schema
  // (`viewOptions: {compact: true}`). Otherwise the user's chosen density is
  // remembered globally (sticky as the user navigates between collections).
  const {
    density,
    locked: forceCompactView,
    setDensity,
  } = useDensity(props.collection);
  const compactView = density === 'compact';

  const sortOptions = [
    ...(customSortingEnabled ? [{value: 'custom', label: 'Custom order'}] : []),
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

  const customSortMode = effectiveOrderBy === 'custom';
  const keylessCount = customSortMode
    ? docs.filter((doc: any) => !doc.sys?.sortKey).length
    : 0;

  // Only blank the page on the very first load. Subsequent reloads (e.g. after
  // changing the sort) keep the previous docs visible and dim them with a
  // spinner overlay instead.
  const showInitialLoader = loading && docs.length === 0;
  const showEmpty = !loading && docs.length === 0;

  const renderNewDocButton = () => (
    <ConditionalTooltip label={NEW_DOC_TOOLTIP} condition={!canEdit}>
      <Button
        variant="primary"
        icon={<IconCirclePlus />}
        onClick={() => setNewDocModalOpen(true)}
        disabled={!canEdit}
      >
        New
      </Button>
    </ConditionalTooltip>
  );

  return (
    <>
      <NewDocModal
        collection={props.collection}
        opened={newDocModalOpen}
        onClose={() => setNewDocModalOpen(false)}
      />
      <div className="CollectionPage__collection">
        <div className="CollectionPage__collection__docsTab pb-30">
          <div className="CollectionPage__collection__docsTab__header mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <h1 className="CollectionPage__collection__docsTab__header__title m-0 min-w-0 flex-1 break-words text-xl font-semibold tracking-tight">
              {collection.name || props.collection}
            </h1>
            <div className="CollectionPage__collection__docsTab__controls flex flex-wrap items-center gap-x-4 gap-y-2 text-base">
              <div className="CollectionPage__collection__docsTab__controls__showArchived">
                <Switch
                  size="md"
                  labelPosition="left"
                  label="Show archived:"
                  checked={showArchived}
                  onChange={(e) =>
                    setShowArchived(Boolean(e.currentTarget.checked))
                  }
                />
              </div>
              <div className="CollectionPage__collection__docsTab__controls__sort flex items-center gap-2">
                <div
                  className="CollectionPage__collection__docsTab__controls__sort__label font-medium"
                  aria-hidden="true"
                >
                  Sort:
                </div>
                <Select
                  className="w-45"
                  aria-label="Sort"
                  value={effectiveOrderBy}
                  onValueChange={(value) => setOrderBy(value || 'modifiedAt')}
                  data={sortOptions}
                />
              </div>
              <DensityControl
                density={density}
                locked={forceCompactView}
                onChange={setDensity}
              />
              <div className="CollectionPage__collection__docsTab__controls__newDoc">
                {renderNewDocButton()}
              </div>
            </div>
          </div>
          {customSortMode && !loading && keylessCount > 0 && canEdit && (
            <AssignPositionsBanner
              collectionId={props.collection}
              docs={docs}
              keylessCount={keylessCount}
              onAssigned={() => listDocs()}
            />
          )}
          <Surface className="CollectionPage__collection__docsTab__content">
            {showInitialLoader ? (
              <div className="CollectionPage__collection__docsTab__content__loading my-22 flex justify-center">
                <Spinner size="lg" />
              </div>
            ) : showEmpty ? (
              <div className="CollectionPage__collection__docsEmpty flex flex-col items-center gap-3 px-10 py-20 text-center">
                <div className="CollectionPage__collection__docsEmpty__title text-base font-medium">
                  Collection is empty.
                </div>
                <div className="CollectionPage__collection__docsEmpty__button">
                  {renderNewDocButton()}
                </div>
              </div>
            ) : (
              <div className="CollectionPage__collection__docsTab__content__list relative">
                {loading && (
                  // Zero-height and sticky, so the spinner stays at the top
                  // of the viewport over the (dimmed) list without shifting it.
                  <div className="CollectionPage__collection__docsTab__content__reloading pointer-events-none sticky top-0 z-(--cms-z-sticky) flex h-0 justify-center">
                    <Spinner size="lg" className="mt-6" />
                  </div>
                )}
                <div
                  className={cn(
                    'CollectionPage__collection__docsTab__content__items',
                    loading &&
                      'CollectionPage__collection__docsTab__content__items--loading pointer-events-none opacity-50 transition-opacity'
                  )}
                >
                  <CollectionPage.DocsList
                    collection={props.collection}
                    docs={docs}
                    compact={compactView}
                    orderBy={effectiveOrderBy}
                    onSort={setOrderBy}
                    reloadDocs={() => listDocs()}
                    reorderable={customSortMode && canEdit}
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
  return (
    <div className="CollectionPage__collection__docsTab__controls__density flex items-center gap-2">
      <div
        className="CollectionPage__collection__docsTab__controls__density__label font-medium"
        aria-hidden="true"
      >
        View:
      </div>
      {props.locked ? (
        <IconButton
          variant="default"
          label="Change view density"
          tooltip="This collection is locked to the compact view"
          disabled
        >
          <ActiveIcon />
        </IconButton>
      ) : (
        <Menu
          placement="bottom-end"
          trigger={
            <IconButton variant="default" label="Change view density">
              <ActiveIcon />
            </IconButton>
          }
        >
          <MenuGroup label="View density">
            {DENSITY_OPTIONS.map((option) => {
              const OptionIcon = option.Icon;
              const isActive = option.value === props.density;
              return (
                <MenuItem
                  key={option.value}
                  icon={<OptionIcon />}
                  hint={
                    isActive ? (
                      <IconCheck stroke={2.5} aria-label="Selected" />
                    ) : undefined
                  }
                  onClick={() => props.onChange(option.value)}
                >
                  {option.label}
                </MenuItem>
              );
            })}
          </MenuGroup>
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

const HEADER_CELL_CLASSES =
  'CollectionPage__collection__docsList__header__cell text-xs font-semibold uppercase tracking-wide text-muted';

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
      className={cn(
        HEADER_CELL_CLASSES,
        'CollectionPage__collection__docsList__header__cell--sortable',
        'm-0 flex cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 text-left font-sans hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        active &&
          'CollectionPage__collection__docsList__header__cell--active text-fg'
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
 * Banner shown in the "Custom order" view when some docs don't have a
 * `sys.sortKey` yet (docs created before the collection's `customSorting`
 * option was enabled, or docs created by import scripts). Offers a one-click
 * action that appends positions for those docs — in the currently displayed
 * order — after the current max sort key. This also serves as the one-time
 * initialization when enabling custom sorting on an existing collection.
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
    <div className="CollectionPage__collection__assignPositions mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-l-3 border-border border-l-warning bg-surface px-3 py-2">
      <div className="CollectionPage__collection__assignPositions__text min-w-0 flex-1 text-sm">
        <b>
          {props.keylessCount === 1
            ? '1 doc has no position in the custom order.'
            : `${props.keylessCount} docs have no position in the custom order.`}
        </b>{' '}
        Unpositioned docs are shown at the end of the list and are excluded from
        API results ordered by <code>sys.sortKey</code>.
      </div>
      <Button
        variant="primary"
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
 * ("Custom order" sort + edit permission); otherwise renders a plain div so
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
  /** Renders a compact (grid) row instead of a comfortable (flex) one. */
  compact?: boolean;
  draggableId: string;
  index: number;
  children: ComponentChildren;
}) {
  const className = cn(
    'CollectionPage__collection__docsList__doc',
    'border-t border-border first:border-t-0',
    props.compact
      ? 'grid items-center gap-3.5 px-3 py-1'
      : 'flex items-center overflow-hidden p-3'
  );
  if (!props.enabled) {
    return <div className={className}>{props.children}</div>;
  }
  return (
    <Draggable draggableId={props.draggableId} index={props.index}>
      {(provided: any, snapshot: any) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            className,
            snapshot.isDragging &&
              'CollectionPage__collection__docsList__doc--dragging rounded-sm border border-border bg-surface-hover shadow-md'
          )}
        >
          <div
            className={cn(
              'CollectionPage__collection__docsList__doc__handle flex shrink-0 cursor-grab items-center leading-none text-subtle active:cursor-grabbing',
              !props.compact && 'self-stretch pr-3'
            )}
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
  /** Enables drag-to-reorder (the "Custom order" sort mode). */
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
      e.action === 'publish' ||
      e.action === 'revert-draft' ||
      e.action === 'schedule' ||
      e.action === 'unpublish' ||
      e.action === 'unschedule' ||
      e.action === 'locked' ||
      e.action === 'unlocked'
    ) {
      props.reloadDocs();
    }
  }

  const reorderable = !!props.reorderable;

  /**
   * Returns an optimistic local copy of a doc with an updated sort key.
   * `sys.modifiedAt` is also updated so the doc immediately shows as having
   * unpublished changes (the persisted write does the same server-side; the
   * new order requires publishing to take effect on live listings).
   */
  function withSortKey(doc: any, sortKey: string) {
    return {
      ...doc,
      sys: {
        ...doc.sys,
        sortKey,
        modifiedAt: Timestamp.now(),
        modifiedBy: window.firebase.user.email,
      },
    };
  }

  /**
   * Moves a doc to a new position in the custom order (used by drag-and-drop
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
          next[toIndex] = withSortKey(moved, newKey);
          props.onDocsChange(next);
          await cmsSetDocSortKey(moved.id, newKey);
          return;
        }
      }
      // Some docs have no sort key yet (or neighbor keys collided):
      // renormalize by assigning fresh, evenly-spaced keys to every doc in
      // the current display order.
      const keys = generateNKeysBetween(null, null, next.length);
      const renormalized = next.map((doc: any, i: number) =>
        withSortKey(doc, keys[i])
      );
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
      // The table's columns don't fit a phone, so it scrolls sideways there.
      <div className="CollectionPage__collection__docsList__scroll overflow-x-auto">
        <ReorderableList
          enabled={reorderable}
          onReorder={handleReorder}
          className={cn(
            'CollectionPage__collection__docsList',
            'CollectionPage__collection__docsList--compact min-w-170',
            reorderable && 'CollectionPage__collection__docsList--reorderable'
          )}
          style={{['--docs-status-width' as any]: `${statusColumnWidth}px`}}
        >
          <div className="CollectionPage__collection__docsList__header grid items-center gap-3.5 border-b border-border px-3 py-1">
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
            <div className={HEADER_CELL_CLASSES}>Status</div>
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
                compact
                draggableId={doc.id}
                index={index}
              >
                <a
                  className="CollectionPage__collection__docsList__doc__image box-content block w-10 shrink-0 border border-border leading-none"
                  href={cmsUrl}
                >
                  <FilePreview
                    file={previewImage}
                    width={40}
                    height={30}
                    fit={rootCollection.preview?.fit}
                    withPlaceholder={!previewImage?.src}
                  />
                </a>
                <a
                  className="CollectionPage__collection__docsList__doc__docId truncate text-sm font-medium text-fg no-underline hover:underline"
                  href={cmsUrl}
                >
                  {doc.slug}
                </a>
                <a
                  className="CollectionPage__collection__docsList__doc__title truncate text-sm font-semibold text-fg no-underline hover:underline"
                  href={cmsUrl}
                >
                  {previewTitle || '[UNTITLED]'}
                </a>
                <div className="CollectionPage__collection__docsList__doc__badges flex min-w-0 items-center gap-2.5">
                  <DocStatusBadges doc={doc} />
                </div>
                <div className={TIMESTAMP_CLASSES}>
                  {renderTimestamp(doc?.sys?.createdAt, doc?.sys?.createdBy)}
                </div>
                <div className={TIMESTAMP_CLASSES}>
                  {renderTimestamp(doc?.sys?.modifiedAt, doc?.sys?.modifiedBy)}
                </div>
                <div className="CollectionPage__collection__docsList__doc__controls flex">
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
                    showPublish
                  />
                </div>
              </ReorderableRow>
            );
          })}
        </ReorderableList>
      </div>
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
            <div className="CollectionPage__collection__docsList__doc__image hidden shrink-0 border border-border sm:block">
              <a className="block leading-none" href={cmsUrl}>
                <FilePreview
                  file={previewImage}
                  width={120}
                  height={90}
                  fit={rootCollection.preview?.fit}
                  withPlaceholder={!previewImage?.src}
                />
              </a>
            </div>
            <a
              className="CollectionPage__collection__docsList__doc__content block min-w-0 flex-1 pr-3 text-fg no-underline sm:pl-3"
              href={cmsUrl}
            >
              <div className="CollectionPage__collection__docsList__doc__content__header flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="CollectionPage__collection__docsList__doc__content__header__docId break-all text-base font-medium">
                  {doc.id}
                </div>
                <DocStatusBadges doc={doc} />
              </div>
              <div className="CollectionPage__collection__docsList__doc__content__title line-clamp-1 text-xl font-semibold leading-normal sm:text-2xl sm:leading-9">
                {previewTitle || '[UNTITLED]'}
              </div>
              {hasCollectionUrl && liveUrl && (
                <div className="CollectionPage__collection__docsList__doc__content__url truncate text-sm font-medium text-muted">
                  {liveUrl}
                </div>
              )}
            </a>
            <div className="CollectionPage__collection__docsList__doc__controls shrink-0">
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
                showPublish
              />
            </div>
          </ReorderableRow>
        );
      })}
    </ReorderableList>
  );
};

const TIMESTAMP_CLASSES =
  'CollectionPage__collection__docsList__doc__timestamp flex min-w-0 items-center text-sm leading-snug';

const TIMESTAMP_VALUE_CLASSES =
  'CollectionPage__collection__docsList__doc__timestamp__value block cursor-default truncate font-medium text-fg';

/**
 * Renders a relative timestamp (e.g. "3d ago") for the compact docs list.
 * Returns an em dash when the timestamp is missing. A tooltip shows the full
 * date and the user who performed the action (with their avatar) when
 * available.
 */
function renderTimestamp(ts: any, by?: string) {
  if (!ts || typeof ts.toMillis !== 'function') {
    return <span className={TIMESTAMP_VALUE_CLASSES}>—</span>;
  }
  return (
    <UserActionTooltip message={formatDateTime(ts)} user={by}>
      <span className={TIMESTAMP_VALUE_CLASSES}>
        {getTimeAgo(ts.toMillis())}
      </span>
    </UserActionTooltip>
  );
}
