import {
  Accordion,
  Button,
  Loader,
  MultiSelect,
  Pagination,
  Select,
  Table,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {useDebouncedValue} from '@mantine/hooks';
import {IconSearch} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import {Action, listActions} from '../../utils/actions.js';
import {joinClassNames} from '../../utils/classes.js';
import {getSpreadsheetUrl} from '../../utils/gsheets.js';
import {Surface} from '../Surface/Surface.js';
import {UserAvatar} from '../UserAvatar/UserAvatar.js';
import './ActionsLogs.css';

export interface ActionLogsProps {
  className?: string;
  /** Maximum number of actions to display. If not specified, all are loaded. */
  limit?: number;
  /** When true, hides filters, summary, and pagination. */
  compact?: boolean;
}

/** Number of actions to display per page. */
const PAGE_SIZE = 50;

/** Time filter options. */
const TIME_FILTERS = [
  {value: 'all', label: 'All time'},
  {value: '1h', label: 'Last hour'},
  {value: '24h', label: 'Last 24 hours'},
  {value: '7d', label: 'Last 7 days'},
  {value: '30d', label: 'Last 30 days'},
];

function useActions(limit?: number) {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    // Fetch actions, applying limit if specified.
    listActions(limit ? {limit: limit} : undefined).then((actions) => {
      setActions(actions);
      setLoading(false);
    });
  }, [limit]);

  return {loading, actions};
}

export function ActionLogs(props: ActionLogsProps) {
  if (props.compact) {
    return <ActionLogsCompact {...props} />;
  }

  // Filter state.
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [actionFilters, setActionFilters] = useState<string[]>([]);
  const [userFilters, setUserFilters] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<string | null>('all');

  // Pagination state.
  const [currentPage, setCurrentPage] = useState(1);

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

  // Paginate filtered actions (skip pagination in compact mode).
  const totalPages = props.compact
    ? 1
    : Math.ceil(filteredActions.length / PAGE_SIZE);
  const paginatedActions = useMemo(() => {
    if (props.compact) {
      return filteredActions;
    }
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredActions.slice(start, start + PAGE_SIZE);
  }, [filteredActions, currentPage, props.compact]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, actionFilters, userFilters, timeFilter]);

  if (loading) {
    return (
      <div
        className={`ActionsLog ActionsLog--loading ${props.className || ''}`}
      >
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <div className={`ActionsLog ${props.className || ''}`}>
      {!props.compact && (
        <div className="ActionsLog__tableHeader">
          <div className="ActionsLog__filters">
            <TextInput
              className="ActionsLog__filters__search"
              placeholder="Search actions..."
              icon={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e: Event) =>
                setSearchQuery((e.target as HTMLInputElement).value)
              }
            />
            <MultiSelect
              className="ActionsLog__filters__select"
              placeholder="Filter by action"
              clearable
              searchable
              data={actionTypes}
              value={actionFilters}
              onChange={setActionFilters}
            />
            <MultiSelect
              className="ActionsLog__filters__select"
              placeholder="Filter by user"
              clearable
              searchable
              data={users}
              value={userFilters}
              onChange={setUserFilters}
            />
            <Select
              className="ActionsLog__filters__select"
              placeholder="Filter by time"
              data={TIME_FILTERS}
              value={timeFilter}
              onChange={setTimeFilter}
            />
          </div>
          <div className="ActionsLog__summary">
            Showing {paginatedActions.length} of {filteredActions.length}{' '}
            actions
            {filteredActions.length !== actions.length &&
              ` (filtered from ${actions.length} total)`}
          </div>
        </div>
      )}

      <Surface className="ActionsLog__tableSurface">
        <Table className="ActionsLog__table">
          <thead>
            <tr className="ActionsLogs__table__row ActionsLogs__table__row--header">
              <th className="ActionsLogs__table__header">Timestamp</th>
              <th className="ActionsLogs__table__header">User</th>
              <th className="ActionsLogs__table__header">Action</th>
              <th className="ActionsLogs__table__header">Details</th>
              <th className="ActionsLogs__table__header">Links</th>
            </tr>
          </thead>
          <tbody>
            {paginatedActions.map((action, index) => (
              <tr key={index} className="ActionsLogs__table__row">
                <td className="ActionsLogs__table__col ActionsLogs__table__col--nowrap">
                  {formatDate(action.timestamp)}
                </td>
                <td className="ActionsLogs__table__col ActionsLogs__table__col--nowrap">
                  <span className="ActionsLogs__user">
                    {action.by ? (
                      <>
                        <UserAvatar email={action.by} size={20} />
                        <span className="ActionsLogs__user__email">
                          {action.by}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </td>
                <td className="ActionsLogs__table__col ActionsLogs__table__col--action">
                  <span className="ActionsLogs__action">{action.action}</span>
                </td>
                <td className="ActionsLogs__table__col ActionsLogs__table__col--metadata">
                  <MetadataDisplay metadata={action.metadata} />
                </td>
                <td className="ActionsLogs__table__col ActionsLogs__table__col--links">
                  <QuickLinks action={action} />
                </td>
              </tr>
            ))}
            {paginatedActions.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="ActionsLogs__table__col ActionsLogs__table__col--empty"
                >
                  No actions found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Surface>

      {!props.compact && totalPages > 1 && (
        <div className="ActionsLog__pagination">
          <Pagination
            total={totalPages}
            value={currentPage}
            onChange={setCurrentPage}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

/** Displays metadata in a user-friendly format. */
function MetadataDisplay(props: {metadata: any}) {
  const {metadata} = props;
  if (!metadata || Object.keys(metadata).length === 0) {
    return <span className="ActionsLogs__metadata--empty">—</span>;
  }

  const entries = Object.entries(metadata);
  return (
    <div className="ActionsLogs__metadata">
      {entries.map(([key, value]) => (
        <div key={key} className="ActionsLogs__metadata__item">
          <span className="ActionsLogs__metadata__key">{key}:</span>{' '}
          <span className="ActionsLogs__metadata__value">
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
      <Tooltip key="doc" transition="pop" label={action.metadata.docId}>
        <Button
          component="a"
          variant="default"
          size="xs"
          compact
          href={`/cms/content/${action.metadata.docId}`}
        >
          {label('Open doc')}
        </Button>
      </Tooltip>
    );
  }

  if (action.action !== 'datasource.delete' && action.metadata?.datasourceId) {
    links.push(
      <Tooltip
        key="datasource"
        transition="pop"
        label={action.metadata.datasourceId}
      >
        <Button
          component="a"
          variant="default"
          size="xs"
          compact
          href={`/cms/data/${action.metadata.datasourceId}`}
        >
          {label('Open data source')}
        </Button>
      </Tooltip>
    );
  }

  if (action.action !== 'release.delete' && action.metadata?.releaseId) {
    links.push(
      <Tooltip key="release" transition="pop" label={action.metadata.releaseId}>
        <Button
          component="a"
          variant="default"
          size="xs"
          compact
          href={`/cms/releases/${action.metadata.releaseId}`}
        >
          {label('Open release')}
        </Button>
      </Tooltip>
    );
  }

  if (action.metadata?.sheetId) {
    links.push(
      <Button
        key="sheet"
        component="a"
        variant="default"
        size="xs"
        compact
        href={getSpreadsheetUrl(action.metadata.sheetId)}
        target="_blank"
      >
        {label('Open sheet')}
      </Button>
    );
  }

  if (action.action.startsWith('acls.')) {
    links.push(
      <Button
        key="settings"
        component="a"
        variant="default"
        size="xs"
        compact
        href="/cms/settings"
      >
        {label('Open settings')}
      </Button>
    );
  }

  if (action.links) {
    action.links.forEach((link, index) => {
      links.push(
        <Button
          key={`link-${index}`}
          component="a"
          variant="default"
          size="xs"
          compact
          href={link.url}
          target={link.target}
        >
          {link.label}
        </Button>
      );
    });
  }

  if (links.length === 0) {
    return <span className="ActionsLogs__links--empty"></span>;
  }

  if (props.limit) {
    links = links.slice(0, props.limit);
  }

  return <div className="ActionsLogs__table__buttons">{links}</div>;
}

/**
 * Compact variant of the action logs. Used primarily by the main ProjectPage.
 */
function ActionLogsCompact(props: ActionLogsProps) {
  const {actions, loading} = useActions(props.limit || 10);

  if (loading) {
    return (
      <div
        className={joinClassNames(
          props.className,
          'ActionLogsCompact',
          'ActionLogsCompact--loading'
        )}
      >
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <div
      className={joinClassNames(
        props.className,
        'ActionLogsCompact',
        'ActionLogsCompact--loading'
      )}
    >
      {/* {loading &&  */}
      <Accordion className="ActionLogsCompact__table" multiple>
        {actions.map((action, i) => (
          <Accordion.Item
            label={<ActionLogsCompactItemPreview action={action} />}
            key={i}
          >
            <ActionLogsCompactItemDetails action={action} />
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}

function ActionLogsCompactItemPreview(props: {action: Action}) {
  const action = props.action;
  const actionMetaId = getFirstMetadataId(action);
  const actionBy = props.action.by || '';

  return (
    <div className="ActionLogsCompactItemPreview">
      <div className="ActionLogsCompactItemPreview__user">
        <UserAvatar email={actionBy} size={20} />
      </div>
      <div className="ActionLogsCompactItemPreview__timestamp">
        {formatDate(action.timestamp)}
      </div>
      <div className="ActionLogsCompactItemPreview__action">
        {action.action}
      </div>
      <div className="ActionLogsCompactItemPreview__actionMetaId">
        {actionMetaId}
      </div>
      <div className="ActionLogsCompactItemPreview__buttons">
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
    <div className="ActionLogsCompactItemDetails">
      <MetadataDisplay metadata={metadata} />
      <QuickLinks action={action} />
    </div>
  );
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

function formatDate(timestamp: Timestamp) {
  const validTs = toTimestamp(timestamp);
  if (!validTs) {
    return 'Invalid date';
  }
  const date = validTs.toDate();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
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
