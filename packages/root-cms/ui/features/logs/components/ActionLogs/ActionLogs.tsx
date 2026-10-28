import {IconExternalLink, IconSearch} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {
  Pagination,
  PaginationSummary,
} from '../../../../components/Pagination/Pagination.js';
import {RootJsBeet} from '../../../../components/RootJsLogo/RootJsLogo.js';
import {usePagination} from '../../../../hooks/usePagination.js';
import {getSpreadsheetUrl} from '../../../../integrations/gsheets.js';
import {
  Accordion,
  AccordionItem,
} from '../../../../primitives/Accordion/Accordion.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {MultiSelect} from '../../../../primitives/MultiSelect/MultiSelect.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../../../primitives/Table/Table.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {UserAvatar} from '../../../users/UserAvatar/UserAvatar.js';
import {Action, listActions} from '../../actions.js';
import './ActionsLogs.css';

export interface ActionLogsProps {
  className?: string;
  /** Maximum number of actions to display. If not specified, all are loaded. */
  limit?: number;
  /** When true, hides filters, summary, and pagination. */
  compact?: boolean;
  /**
   * When true, shows the onboarding message in place of the actions, even if
   * the project has activity. Only applies to the compact variant.
   */
  showOnboarding?: boolean;
}

/** Number of actions to display per page. */
const PAGE_SIZE = 50;

/**
 * Actions that modify a doc's content, for which a "Show changes" diff link
 * can be displayed.
 */
const DOC_CHANGE_ACTIONS = [
  'doc.save',
  'doc.publish',
  'doc.restore_version',
  'doc.import_translations',
  'doc.revert',
];

/** URL to the Root.js guides, linked from the onboarding message. */
const GUIDES_URL = 'https://rootjs.dev/guides/';

/** Time filter options. */
const TIME_FILTERS = [
  {value: 'all', label: 'All time'},
  {value: '1h', label: 'Last hour'},
  {value: '24h', label: 'Last 24 hours'},
  {value: '7d', label: 'Last 7 days'},
  {value: '30d', label: 'Last 30 days'},
];

/** Returns `value`, updated only once it stops changing for `delay` ms. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function useActions(limit?: number) {
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const init = async () => {
      await notifyErrors(async () => {
        // Fetch actions, applying limit if specified.
        const actions = await withTimeout(
          listActions(limit ? {limit: limit} : undefined),
          undefined,
          'loading action logs'
        );
        setActions(actions);
        setLoaded(true);
      });
      setLoading(false);
    };
    init();
  }, [limit]);

  return {loading, loaded, actions};
}

export function ActionLogs(props: ActionLogsProps) {
  if (props.compact) {
    return <ActionLogsCompact {...props} />;
  }

  // Filter state.
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [actionFilters, setActionFilters] = useState<string[]>([]);
  const [userFilters, setUserFilters] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<string | null>('all');

  const {actions, loading} = useActions();

  // Derive unique action types and users for filter dropdowns.
  const actionTypes = useMemo(() => {
    const types = new Set<string>();
    actions.forEach((a) => types.add(a.action));
    return Array.from(types).sort();
  }, [actions]);

  const users = useMemo(() => {
    const userSet = new Set<string>();
    actions.forEach((a) => {
      if (a.by) {
        userSet.add(a.by);
      }
    });
    return Array.from(userSet).sort();
  }, [actions]);

  // Filter actions based on search, action type, user, and time.
  const filteredActions = useMemo(() => {
    const now = Date.now();
    return actions.filter((action) => {
      // Filter by search query.
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const matchesAction = action.action.toLowerCase().includes(query);
        const matchesUser = action.by?.toLowerCase().includes(query);
        const matchesMetadata = stringifyObj(action.metadata)
          .toLowerCase()
          .includes(query);
        if (!matchesAction && !matchesUser && !matchesMetadata) {
          return false;
        }
      }

      // Filter by action types.
      if (actionFilters.length > 0 && !actionFilters.includes(action.action)) {
        return false;
      }

      // Filter by users.
      if (
        userFilters.length > 0 &&
        (!action.by || !userFilters.includes(action.by))
      ) {
        return false;
      }

      // Filter by time.
      if (timeFilter && timeFilter !== 'all') {
        const validTs = toTimestamp(action.timestamp);
        if (!validTs) {
          return false;
        }
        const actionTime = validTs.toMillis();
        let cutoff = 0;
        switch (timeFilter) {
          case '1h':
            cutoff = now - 60 * 60 * 1000;
            break;
          case '24h':
            cutoff = now - 24 * 60 * 60 * 1000;
            break;
          case '7d':
            cutoff = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case '30d':
            cutoff = now - 30 * 24 * 60 * 60 * 1000;
            break;
        }
        if (actionTime < cutoff) {
          return false;
        }
      }

      return true;
    });
  }, [actions, debouncedSearch, actionFilters, userFilters, timeFilter]);

  // Paginate filtered actions, resetting to the first page when filters change.
  const pagination = usePagination(filteredActions, {
    pageSize: PAGE_SIZE,
    resetDeps: [debouncedSearch, actionFilters, userFilters, timeFilter],
  });
  const paginatedActions = pagination.pageItems;

  if (loading) {
    return (
      <div
        className={cn(
          'ActionsLog ActionsLog--loading',
          'flex min-h-50 items-center justify-center text-muted',
          props.className
        )}
      >
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={cn('ActionsLog', 'flex flex-col gap-4', props.className)}>
      {!props.compact && (
        <div className="ActionsLog__tableHeader flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-15">
          <div className="ActionsLog__filters flex flex-wrap items-center gap-3">
            <TextInput
              className="ActionsLog__filters__search w-full sm:w-auto sm:min-w-50 sm:max-w-75 sm:flex-1"
              size="md"
              aria-label="Search actions"
              placeholder="Search actions..."
              leftSection={<IconSearch />}
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <MultiSelect
              className="ActionsLog__filters__select w-full sm:w-auto sm:min-w-45"
              size="md"
              aria-label="Filter by action"
              placeholder="Filter by action"
              clearable
              data={actionTypes}
              value={actionFilters}
              onValueChange={setActionFilters}
            />
            <MultiSelect
              className="ActionsLog__filters__select w-full sm:w-auto sm:min-w-45"
              size="md"
              aria-label="Filter by user"
              placeholder="Filter by user"
              clearable
              data={users}
              value={userFilters}
              onValueChange={setUserFilters}
            />
            <Select
              className="ActionsLog__filters__select w-full sm:w-auto sm:min-w-45"
              size="md"
              aria-label="Filter by time"
              placeholder="Filter by time"
              data={TIME_FILTERS}
              value={timeFilter}
              onValueChange={setTimeFilter}
            />
          </div>
          <PaginationSummary
            start={pagination.start}
            end={pagination.end}
            total={pagination.totalItems}
            noun="action"
            note={
              filteredActions.length !== actions.length
                ? `filtered from ${actions.length} total`
                : undefined
            }
          />
        </div>
      )}

      <Table
        className="ActionsLog__tableSurface rounded-lg"
        tableClassName="ActionsLog__table font-mono"
        label="Action logs"
        hover
      >
        <TableHead>
          <TableRow className="ActionsLogs__table__row ActionsLogs__table__row--header">
            <TableHeaderCell className={HEADER_CELL_CLASSES}>
              Timestamp
            </TableHeaderCell>
            <TableHeaderCell className={HEADER_CELL_CLASSES}>
              User
            </TableHeaderCell>
            <TableHeaderCell className={HEADER_CELL_CLASSES}>
              Action
            </TableHeaderCell>
            <TableHeaderCell className={HEADER_CELL_CLASSES}>
              Details
            </TableHeaderCell>
            <TableHeaderCell className={HEADER_CELL_CLASSES}>
              Links
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paginatedActions.map((action, index) => (
            <TableRow key={index} className="ActionsLogs__table__row">
              <TableCell
                className={cn(
                  'ActionsLogs__table__col ActionsLogs__table__col--nowrap',
                  CELL_CLASSES,
                  'w-px whitespace-nowrap'
                )}
              >
                <ActionTimestamp timestamp={action.timestamp} format="long" />
              </TableCell>
              <TableCell
                className={cn(
                  'ActionsLogs__table__col ActionsLogs__table__col--nowrap',
                  CELL_CLASSES,
                  'w-px whitespace-nowrap'
                )}
              >
                <span className="ActionsLogs__user inline-flex items-center gap-1.5 align-middle text-muted">
                  {action.by ? (
                    <>
                      <UserAvatar email={action.by} size={20} />
                      <span className="ActionsLogs__user__email whitespace-nowrap">
                        {action.by}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  'ActionsLogs__table__col ActionsLogs__table__col--action',
                  CELL_CLASSES,
                  'w-px whitespace-nowrap'
                )}
              >
                <span className="ActionsLogs__action rounded-sm bg-chip px-1.5 py-0.5 font-medium">
                  {action.action}
                </span>
              </TableCell>
              <TableCell
                className={cn(
                  'ActionsLogs__table__col ActionsLogs__table__col--metadata',
                  CELL_CLASSES,
                  'min-w-50 max-w-75'
                )}
              >
                <MetadataDisplay metadata={action.metadata} />
              </TableCell>
              <TableCell
                className={cn(
                  'ActionsLogs__table__col ActionsLogs__table__col--links',
                  CELL_CLASSES,
                  'w-px whitespace-nowrap'
                )}
              >
                <QuickLinks action={action} />
              </TableCell>
            </TableRow>
          ))}
          {paginatedActions.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="ActionsLogs__table__col ActionsLogs__table__col--empty px-2.5 py-6 text-center text-sm text-muted"
              >
                No actions found matching your filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Pagination
        total={pagination.totalPages}
        page={pagination.page}
        onChange={pagination.setPage}
      />
    </div>
  );
}

/** Padding and text size of the full table's header cells. */
const HEADER_CELL_CLASSES =
  'ActionsLogs__table__header px-2.5 py-1 text-left text-sm';

/** Padding and text size of the full table's body cells. */
const CELL_CLASSES = 'px-2.5 py-1 text-left text-sm';

/** Displays metadata in a user-friendly format. */
function MetadataDisplay(props: {metadata: any}) {
  const {metadata} = props;
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="ActionsLogs__metadata--empty text-subtle">—</span>;
  }

  const entries = Object.entries(metadata);
  return (
    <div className="ActionsLogs__metadata flex flex-col gap-0.5 text-sm">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="ActionsLogs__metadata__item flex flex-wrap gap-1"
        >
          <span className="ActionsLogs__metadata__key text-muted">{key}:</span>{' '}
          <span className="ActionsLogs__metadata__value break-words text-fg">
            {formatMetadataValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Formats a metadata value for display. */
function formatMetadataValue(value: any): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    if (value.length <= 3) {
      return value.join(', ');
    }
    return `${value.slice(0, 3).join(', ')} (+${value.length - 3} more)`;
  }
  if (typeof value === 'object') {
    const obj = cleanObject(value);
    try {
      return JSON.stringify(obj);
    } catch (e) {
      console.error(e);
      console.error('failed to stringify json:', obj);
    }
  }
  return String(value);
}

/**
 * Removes keys starting with `_` from the object. Without this for some reason
 * there are circular issues when trying to stringify to JSON.
 */
function cleanObject(obj: any) {
  const newObj: any = {};
  Object.entries(obj).forEach(([key, val]) => {
    if (!key.startsWith('_')) {
      newObj[key] = val;
    }
  });
  return newObj;
}

/** Displays quick links for an action. */
function QuickLinks(props: {action: Action; label?: string; limit?: number}) {
  const {action} = props;
  let links: preact.JSX.Element[] = [];

  function label(defaultLabel: string) {
    return props.label || defaultLabel;
  }

  if (action.action !== 'doc.delete' && action.metadata?.docId) {
    links.push(
      <Tooltip key="doc" label={action.metadata.docId}>
        <Button
          variant="default"
          size="xs"
          href={`/cms/content/${action.metadata.docId}`}
        >
          {label('Open doc')}
        </Button>
      </Tooltip>
    );
  }

  // For actions that change doc content, link to a diff of the changes
  // around the time of the action.
  if (DOC_CHANGE_ACTIONS.includes(action.action) && action.metadata?.docId) {
    const millis = toTimestamp(action.timestamp)?.toMillis();
    if (millis) {
      links.push(
        <Tooltip
          key="changes"
          label={`Show changes to ${action.metadata.docId}`}
        >
          <Button
            variant="default"
            size="xs"
            href={getCompareUrl(action.metadata.docId, millis)}
          >
            {label('Show changes')}
          </Button>
        </Tooltip>
      );
    }
  }

  if (action.action !== 'datasource.delete' && action.metadata?.datasourceId) {
    links.push(
      <Tooltip key="datasource" label={action.metadata.datasourceId}>
        <Button
          variant="default"
          size="xs"
          href={`/cms/data/${action.metadata.datasourceId}`}
        >
          {label('Open data source')}
        </Button>
      </Tooltip>
    );
  }

  if (action.action !== 'release.delete' && action.metadata?.releaseId) {
    links.push(
      <Tooltip key="release" label={action.metadata.releaseId}>
        <Button
          variant="default"
          size="xs"
          href={`/cms/releases/${action.metadata.releaseId}`}
        >
          {label('Open release')}
        </Button>
      </Tooltip>
    );
  }

  if (action.action !== 'asset.delete' && action.metadata?.assetId) {
    links.push(
      <Tooltip
        key="asset"
        label={action.metadata.path || action.metadata.assetId}
      >
        <Button
          variant="default"
          size="xs"
          href={`/cms/assets?asset=${action.metadata.assetId}`}
        >
          {label('Open asset')}
        </Button>
      </Tooltip>
    );
  }

  // Tasks are soft-deleted, so the task page is still viewable (and
  // restorable) after a `tasks.delete` action.
  if (action.action.startsWith('tasks.') && action.metadata?.taskId) {
    links.push(
      <Tooltip key="task" label={action.metadata.taskId}>
        <Button
          variant="default"
          size="xs"
          href={`/cms/tasks/${action.metadata.taskId}`}
        >
          {label('Open task')}
        </Button>
      </Tooltip>
    );
  }

  if (action.metadata?.sheetId) {
    links.push(
      <Button
        key="sheet"
        variant="default"
        size="xs"
        href={getSpreadsheetUrl(action.metadata.sheetId)}
        target="_blank"
      >
        {label('Open sheet')}
      </Button>
    );
  }

  if (action.action.startsWith('acls.')) {
    links.push(
      <Button key="settings" variant="default" size="xs" href="/cms/settings">
        {label('Open settings')}
      </Button>
    );
  }

  if (action.links) {
    action.links.forEach((link, index) => {
      links.push(
        <Button
          key={`link-${index}`}
          variant="default"
          size="xs"
          href={link.url}
          target={link.target}
        >
          {link.label}
        </Button>
      );
    });
  }

  if (links.length === 0) {
    return <span className="ActionsLogs__links--empty text-subtle"></span>;
  }

  if (props.limit) {
    links = links.slice(0, props.limit);
  }

  return (
    <div className="ActionsLogs__table__buttons flex flex-wrap gap-x-2 gap-y-0.5">
      {links}
    </div>
  );
}

/**
 * Returns a compare url that diffs the doc's changes around the given
 * timestamp, i.e. from the version snapshot saved before the timestamp to the
 * version snapshot saved after it (or the current draft if none exists yet).
 */
function getCompareUrl(docId: string, millis: number) {
  const left = toCompareUrlParam(docId, `before:${millis}`);
  const right = toCompareUrlParam(docId, `after:${millis}`);
  return `/cms/compare?left=${left}&right=${right}`;
}

function toCompareUrlParam(docId: string, versionId: string) {
  return encodeURIComponent(`${docId}@${versionId}`)
    .replaceAll('%2F', '/')
    .replaceAll('%40', '@')
    .replaceAll('%3A', ':');
}

/**
 * Compact variant of the action logs. Used primarily by the main ProjectPage.
 */
function ActionLogsCompact(props: ActionLogsProps) {
  const {actions, loading, loaded} = useActions(props.limit || 10);

  if (loading && !props.showOnboarding) {
    return (
      <div
        className={cn(
          'ActionLogsCompact',
          'ActionLogsCompact--loading',
          'flex justify-center py-6 text-muted',
          props.className
        )}
      >
        <Spinner size="lg" />
      </div>
    );
  }

  // Show an onboarding message for projects with no activity yet. If loading
  // failed, an error notification is shown instead.
  if (props.showOnboarding || (loaded && actions.length === 0)) {
    return (
      <div className={cn('ActionLogsCompact', props.className)}>
        <ActionLogsOnboarding />
      </div>
    );
  }

  return (
    <div className={cn('ActionLogsCompact', props.className)}>
      <Accordion
        className="ActionLogsCompact__table"
        multiple
        chevronPosition="left"
      >
        {actions.map((action, i) => (
          <AccordionItem
            className="ActionLogsCompact__item last:border-b-0"
            value={String(i)}
            label={<ActionLogsCompactItemPreview action={action} />}
            key={i}
          >
            <ActionLogsCompactItemDetails action={action} />
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/**
 * Onboarding message shown in place of the compact action logs when a project
 * has no actions yet (e.g. a newly created project).
 */
function ActionLogsOnboarding() {
  return (
    <div className="ActionLogsOnboarding flex flex-col items-center gap-2 px-6 py-10 text-center">
      <RootJsBeet className="ActionLogsOnboarding__logo mb-3 block" />
      <div className="ActionLogsOnboarding__title text-lg font-semibold text-strong">
        Welcome to Root.js!
      </div>
      <div className="ActionLogsOnboarding__body max-w-105 text-base leading-normal text-muted">
        As your team creates, edits, and publishes content, recent activity will
        show up here.
      </div>
      <div className="ActionLogsOnboarding__body max-w-105 text-base leading-normal text-muted">
        New to Root? The guides cover everything from defining schemas and
        collections to translations, releases, and deploying your site.
      </div>
      <Button
        className="ActionLogsOnboarding__button mt-3"
        variant="default"
        size="sm"
        href={GUIDES_URL}
        target="_blank"
        rel="noopener noreferrer"
        iconRight={<IconExternalLink />}
      >
        Explore the guides
      </Button>
    </div>
  );
}

function ActionLogsCompactItemPreview(props: {action: Action}) {
  const action = props.action;
  const actionMetaId = getPreviewLabel(action);
  const actionBy = props.action.by || '';

  return (
    <div className="ActionLogsCompactItemPreview items-center gap-3 font-mono text-sm font-normal tracking-tight text-fg">
      <div className="ActionLogsCompactItemPreview__user flex">
        <UserAvatar email={actionBy} size={20} />
      </div>
      <div className="ActionLogsCompactItemPreview__timestamp truncate">
        <ActionTimestamp timestamp={action.timestamp} />
      </div>
      <div className="ActionLogsCompactItemPreview__action max-w-full truncate rounded-sm md:justify-self-end bg-chip px-1.5 py-0.5 font-semibold">
        {action.action}
      </div>
      <div className="ActionLogsCompactItemPreview__actionMetaId truncate">
        {actionMetaId}
      </div>
      <div className="ActionLogsCompactItemPreview__buttons flex flex-1 justify-end">
        <QuickLinks action={action} label="Open" limit={1} />
      </div>
    </div>
  );
}

function ActionLogsCompactItemDetails(props: {action: Action}) {
  const action = props.action;
  const metadata = {
    user: action.by,
    ...action.metadata,
  };
  return (
    <div className="ActionLogsCompactItemDetails flex flex-col gap-2 font-mono">
      <MetadataDisplay metadata={metadata} />
      <QuickLinks action={action} />
    </div>
  );
}

/**
 * Returns the label shown in the compact preview row. For asset library
 * actions, this is the asset's human-friendly file path rather than its id.
 */
function getPreviewLabel(action: Action) {
  if (action.action.startsWith('asset.')) {
    const label = getAssetLabel(action.metadata || {});
    if (label) {
      return label;
    }
  }
  return getFirstMetadataId(action);
}

/**
 * Returns a human-friendly label for an asset action. Older logs predate the
 * `path` metadata, so this falls back to the folder path or asset name.
 */
function getAssetLabel(metadata: Record<string, any>): string {
  if (metadata.path) {
    return metadata.path;
  }
  if (metadata.folder) {
    return metadata.folder;
  }
  // Folder renames and moves log the folder's new path as `to`.
  if (!metadata.assetId && typeof metadata.to === 'string') {
    return metadata.to;
  }
  if (Array.isArray(metadata.folders)) {
    return formatMetadataValue(metadata.folders);
  }
  return metadata.name || '';
}

function getFirstMetadataId(action: Action) {
  for (const key of Object.keys(action.metadata || {})) {
    if (key.toLowerCase().endsWith('id')) {
      return action.metadata[key];
    }
  }
  return '';
}

/**
 * Safely converts a timestamp value to a Firestore Timestamp. Handles
 * potentially corrupt or invalid timestamp values from the database.
 */
function toTimestamp(ts: any): Timestamp | null {
  if (!ts) {
    return null;
  }
  // Already a valid Timestamp.
  if (ts instanceof Timestamp) {
    return ts;
  }
  // Firestore Timestamp-like object with _seconds.
  if (typeof ts === 'object' && typeof ts._seconds === 'number') {
    return new Timestamp(ts._seconds, ts._nanoseconds || 0);
  }
  // Firestore Timestamp-like object with seconds.
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return new Timestamp(ts.seconds, ts.nanoseconds || 0);
  }
  // Timestamp as milliseconds number.
  if (typeof ts === 'number') {
    return Timestamp.fromMillis(ts);
  }
  // Invalid timestamp format.
  return null;
}

/**
 * Displays a timestamp in a fixed-width format (so that rows align) with a
 * tooltip showing the exact date and time.
 *
 * Formats:
 * - `compact` (default): `Jun 12, 10:21 AM`
 * - `long`: `June 12, 2026 10:21 AM`
 */
function ActionTimestamp(props: {
  timestamp: Timestamp;
  format?: 'compact' | 'long';
}) {
  const millis = toTimestamp(props.timestamp)?.toMillis() || 0;
  if (!millis) {
    return <span>Invalid date</span>;
  }
  const label =
    props.format === 'long'
      ? formatLongDate(millis)
      : formatCompactDate(millis);
  return (
    <Tooltip label={formatExactDateTime(millis)}>
      <span className="ActionsLogs__timestamp cursor-default">{label}</span>
    </Tooltip>
  );
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatTime(date: Date) {
  const hours24 = date.getHours();
  const ampm = hours24 < 12 ? 'AM' : 'PM';
  const hh = String(hours24 % 12 || 12).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${min} ${ampm}`;
}

/** Formats a timestamp as a fixed-width compact date, e.g. "Jun 12, 10:21 AM". */
function formatCompactDate(millis: number) {
  const date = new Date(millis);
  const dd = String(date.getDate()).padStart(2, '0');
  return `${MONTHS[date.getMonth()]} ${dd}, ${formatTime(date)}`;
}

/** Formats a timestamp as a long date, e.g. "June 12, 2026 10:21 AM". */
function formatLongDate(millis: number) {
  const date = new Date(millis);
  const month = date.toLocaleDateString('en', {month: 'long'});
  const dd = String(date.getDate()).padStart(2, '0');
  return `${month} ${dd}, ${date.getFullYear()} ${formatTime(date)}`;
}

/** Formats a timestamp as an exact date time, e.g. "Jun 11, 2026, 07:23:45 PM". */
function formatExactDateTime(millis: number) {
  return new Date(millis).toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** A pretty printer for JavaScript objects. */
function stringifyObj(obj: any) {
  function format(obj: any): string {
    if (obj === null) {
      return 'null';
    }
    if (typeof obj === 'undefined') {
      return 'undefined';
    }
    if (typeof obj === 'string') {
      return `"${obj.replaceAll('"', '\\"')}"`;
    }
    if (typeof obj !== 'object') {
      return String(obj);
    }
    if (Array.isArray(obj)) {
      return `[${obj.map(format).join(', ')}]`;
    }
    const entries: string[] = Object.entries(obj).map(([key, value]) => {
      return `${key}: ${format(value)}`;
    });
    return `{${entries.join(', ')}}`;
  }
  return format(obj);
}
