import './GlobalSearch.css';
import {SpotlightAction} from '@mantine/spotlight';
import {Spotlight} from '@mantine/spotlight/esm/Spotlight/Spotlight.js';
import {IconSearch} from '@tabler/icons-preact';
import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  DocSlugHit,
  GlobalSearchHit,
  GlobalSearchStatus,
  useDocSlugSearch,
  useGlobalSearch,
} from '../../hooks/useGlobalSearch.js';
import {usePendingReleases} from '../../hooks/usePendingReleases.js';
import {DataSource, listDataSources} from '../../utils/data-source.js';
import {isEditableTarget} from '../../utils/keyboard.js';
import {showErrorNotification} from '../../utils/notifications.js';
import {
  RecentView,
  recentViewFromUrl,
  recordRecentView,
  useRecentViews,
} from '../../utils/recent-views.js';
import {
  GlobalSearchAction,
  GlobalSearchActionMeta,
} from './GlobalSearchAction.js';
import {
  GlobalSearchCounts,
  GlobalSearchFilters,
} from './GlobalSearchFilters.js';
import {
  GlobalSearchFilter,
  GlobalSearchUrlState,
  buildGlobalSearchUrl,
  getGlobalSearchFilterLabel,
  readGlobalSearchUrlState,
  writeGlobalSearchUrlState,
} from './search-filters.js';

function formatLastIndexed(status: GlobalSearchStatus | null): string | null {
  if (!status?.lastRun) {
    return null;
  }
  const ms = Date.now() - status.lastRun;
  if (ms < 60_000) {
    return 'just now';
  }
  if (ms < 60 * 60_000) {
    return `${Math.floor(ms / 60_000)}m ago`;
  }
  if (ms < 24 * 60 * 60_000) {
    return `${Math.floor(ms / (60 * 60_000))}h ago`;
  }
  return `${Math.floor(ms / (24 * 60 * 60_000))}d ago`;
}

interface CollectionTarget {
  kind: 'collection';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

interface DataSourceTarget {
  kind: 'data-source';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

interface ReleaseTarget {
  kind: 'release';
  id: string;
  url: string;
  label: string;
  description?: string;
  haystack: string;
}

type StaticTarget = CollectionTarget | DataSourceTarget | ReleaseTarget;

function buildCollectionTargets(): CollectionTarget[] {
  const collections = window.__ROOT_CTX?.collections || {};
  return Object.entries(collections)
    .map(([id, meta]) => {
      const label = meta?.name || id;
      const description = meta?.description;
      return {
        kind: 'collection' as const,
        id,
        url: `/cms/content/${id}`,
        label,
        description,
        haystack: [id, label, description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildDataSourceTargets(dataSources: DataSource[]): DataSourceTarget[] {
  return dataSources.map((ds) => ({
    kind: 'data-source' as const,
    id: ds.id,
    url: `/cms/data/${ds.id}`,
    label: ds.id,
    description: ds.description,
    haystack: [ds.id, ds.description].filter(Boolean).join(' ').toLowerCase(),
  }));
}

function buildReleaseTargets(
  releases: {id: string; description?: string}[]
): ReleaseTarget[] {
  return releases.map((r) => ({
    kind: 'release' as const,
    id: r.id,
    url: `/cms/releases/${r.id}`,
    label: r.id,
    description: r.description,
    haystack: [r.id, r.description].filter(Boolean).join(' ').toLowerCase(),
  }));
}

function filterStaticTargets(
  targets: StaticTarget[],
  query: string
): StaticTarget[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  // Prefer prefix matches; fall back to substring matches.
  const prefix: StaticTarget[] = [];
  const substr: StaticTarget[] = [];
  for (const t of targets) {
    if (
      t.id.toLowerCase().startsWith(q) ||
      t.label.toLowerCase().startsWith(q)
    ) {
      prefix.push(t);
    } else if (t.haystack.includes(q)) {
      substr.push(t);
    }
  }
  return [...prefix, ...substr];
}

/**
 * Result group labels. Mantine renders these as non-selectable headers above
 * each group, in the order the groups first appear in the actions list.
 */
const GROUP_RECENT = 'Recently viewed';
const GROUP_STATIC = 'Jump to';
const GROUP_DOCS = 'Documents';
const GROUP_FIELDS = 'Field matches';

function buildFieldHitAction(
  hit: GlobalSearchHit,
  onTrigger: () => void
): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'field', hit};
  return {
    id: `field:${hit.id}`,
    group: GROUP_FIELDS,
    title: hit.text || hit.fieldLabel,
    description: `${hit.collection} · ${hit.slug} · ${hit.fieldLabel}`,
    keywords: [hit.collection, hit.slug, hit.fieldLabel],
    onTrigger,
    meta,
  };
}

function buildDocSlugAction(
  hit: DocSlugHit,
  onTrigger: () => void
): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'doc', hit};
  return {
    id: `doc:${hit.docId}`,
    group: GROUP_DOCS,
    title: hit.slug,
    description: hit.collection,
    keywords: [hit.collection, hit.slug, hit.docId],
    onTrigger,
    meta,
  };
}

function buildStaticAction(
  target: StaticTarget,
  onTrigger: () => void
): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'target', target};
  return {
    id: `${target.kind}:${target.id}`,
    group: GROUP_STATIC,
    title: target.label,
    description: target.description || target.id,
    keywords: [target.id, target.label, target.description || ''],
    onTrigger,
    meta,
  };
}

function buildRecentAction(
  view: RecentView,
  onTrigger: () => void
): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'recent', view};
  return {
    id: `recent:${view.url}`,
    group: GROUP_RECENT,
    title: view.label,
    description: view.description || '',
    keywords: [view.label, view.description || '', view.url],
    onTrigger,
    meta,
  };
}

/** Custom event used by `openGlobalSearch()` to reach the provider. */
const OPEN_EVENT = 'rootcms:open-global-search';

/** Duration of the spotlight open/close transition. */
const TRANSITION_MS = 150;

/**
 * Debounce for mirroring the query into the URL. Safari throttles
 * `history.replaceState()` (100 calls per 30s), so the URL must not be
 * rewritten on every keystroke.
 */
const URL_SYNC_DEBOUNCE_MS = 300;

export interface OpenGlobalSearchOptions {
  /** Query to prefill the search input with. */
  query?: string;
  /** Result type filter to preselect. */
  filter?: GlobalSearchFilter;
}

/**
 * Opens the global search modal from anywhere in the CMS, optionally with a
 * prefilled query. Requires a mounted `<GlobalSearch>`.
 */
export function openGlobalSearch(options: OpenGlobalSearchOptions = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, {detail: options}));
}

/** Rewrites the URL's search string without adding a history entry. */
function replaceUrlSearch(search: string) {
  const url = new URL(window.location.href);
  url.search = search;
  try {
    // Preserve the existing history state so the router isn't disrupted.
    window.history.replaceState(window.history.state, '', url.toString());
  } catch (err) {
    console.error('failed to update the search url:', err);
  }
}

/** Removes the `?modal=search` params from the URL, if present. */
function clearSearchUrlState() {
  const search = window.location.search;
  const next = writeGlobalSearchUrlState(search, null);
  if (next !== search) {
    replaceUrlSearch(next);
  }
}

interface BodyContextValue {
  /** Whether the filter tabs should render (only when there's a query). */
  filtersVisible: boolean;
  filter: GlobalSearchFilter;
  onFilterChange: (filter: GlobalSearchFilter) => void;
  counts: GlobalSearchCounts;
  onCopyLink: () => Promise<boolean>;
  /** Whether the footer should render (only when there's a list above it). */
  footerVisible: boolean;
  /** Human-readable age of the search index, e.g. "4m ago". */
  lastIndexed: string | null;
}

const BODY_CONTEXT = createContext<BodyContextValue | null>(null);

/** Keyboard and search syntax hints shown in the footer. */
const FOOTER_HINTS: Array<[string, string]> = [
  ['↑↓', 'navigate'],
  ['↵', 'open'],
  ['"…"', 'exact phrase'],
  ['-word', 'exclude'],
  ['coll/slug', 'jump to doc'],
];

/**
 * Wraps the spotlight's action list. Renders the filter tabs above the
 * results, makes the results scrollable so long lists no longer overflow the
 * viewport, and pins a hints footer below them. Passed to `Spotlight` as
 * `actionsWrapperComponent`, which is why it reads its state from context
 * rather than props.
 */
function GlobalSearchBody(props: {children?: ComponentChildren}) {
  const ctx = useContext(BODY_CONTEXT);
  return (
    <div className="GlobalSearch__body">
      <kbd className="GlobalSearch__esc" aria-hidden="true">
        esc
      </kbd>
      {ctx?.filtersVisible && (
        <GlobalSearchFilters
          value={ctx.filter}
          onChange={ctx.onFilterChange}
          counts={ctx.counts}
          onCopyLink={ctx.onCopyLink}
        />
      )}
      <div className="GlobalSearch__results">{props.children}</div>
      {ctx?.footerVisible && (
        <div className="GlobalSearch__footer">
          {FOOTER_HINTS.map(([key, label]) => (
            <span key={key} className="GlobalSearch__hint">
              <kbd className="GlobalSearch__kbd">{key}</kbd>
              {label}
            </span>
          ))}
          {ctx.lastIndexed && (
            <span className="GlobalSearch__indexed">
              Indexed {ctx.lastIndexed}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Copies a shareable deep link to the current search to the clipboard.
 * Returns false (after notifying the user) when the copy failed.
 */
async function copySearchLink(state: GlobalSearchUrlState): Promise<boolean> {
  const url = new URL(buildGlobalSearchUrl(state), window.location.origin);
  try {
    await navigator.clipboard.writeText(url.toString());
    return true;
  } catch (err) {
    showErrorNotification(err, {title: 'Failed to copy link'});
    return false;
  }
}

function GlobalSearchInner(props: {
  children: ComponentChildren;
  opened: boolean;
  query: string;
  filter: GlobalSearchFilter;
  onQueryChange: (q: string) => void;
  onFilterChange: (filter: GlobalSearchFilter) => void;
  onClose: () => void;
}) {
  const {opened, query, filter, onQueryChange, onFilterChange} = props;
  const location = useLocation();
  const trimmedQuery = query.trim();
  const {
    hits: fieldHits,
    loading: fieldLoading,
    status,
  } = useGlobalSearch(query);
  const {hits: docSlugHits, loading: slugLoading} = useDocSlugSearch(query);

  const recentViews = useRecentViews();

  // Lazy-fetch data sources once when the spotlight provider mounts. Failures
  // just leave the data source list empty — they shouldn't break search.
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  useEffect(() => {
    let cancelled = false;
    listDataSources()
      .then((list) => {
        if (!cancelled) {
          setDataSources(list);
        }
      })
      .catch((err) => {
        console.error('failed to list data sources:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const {releases: pendingReleases} = usePendingReleases();

  // Static spotlight targets: collections (always present), data sources, and
  // active releases (pending = not published, not archived).
  const staticTargets = useMemo<StaticTarget[]>(() => {
    return [
      ...buildCollectionTargets(),
      ...buildDataSourceTargets(dataSources),
      ...buildReleaseTargets(pendingReleases),
    ];
  }, [dataSources, pendingReleases]);

  // Track route changes and record CMS object views so they show up as
  // recent results in the spotlight.
  useEffect(() => {
    const view = recentViewFromUrl(location.url);
    if (view) {
      recordRecentView(view);
    }
  }, [location.url]);

  const navigate = (url: string) => location.route(url);

  // Static matches split by kind so the filter tabs can count and select
  // them individually.
  const matchedStatic = useMemo(() => {
    const matched = filterStaticTargets(staticTargets, trimmedQuery);
    return {
      collections: matched.filter((t) => t.kind === 'collection'),
      dataSources: matched.filter((t) => t.kind === 'data-source'),
      releases: matched.filter((t) => t.kind === 'release'),
    };
  }, [staticTargets, trimmedQuery]);

  const counts = useMemo<GlobalSearchCounts>(
    () => ({
      docs: docSlugHits.length,
      fields: fieldHits.length,
      collections: matchedStatic.collections.length,
      'data-sources': matchedStatic.dataSources.length,
      releases: matchedStatic.releases.length,
    }),
    [docSlugHits, fieldHits, matchedStatic]
  );
  const totalCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // When the query is empty, surface recent views; when populated, compose
  // matches across static targets, doc slug lookups, and field text hits,
  // narrowed down to the active filter.
  const actions: SpotlightAction[] = useMemo(() => {
    if (!trimmedQuery) {
      if (recentViews.length === 0) {
        return [];
      }
      return recentViews.map((view) =>
        buildRecentAction(view, () => navigate(view.url))
      );
    }

    const show = (kind: Exclude<GlobalSearchFilter, 'all'>) =>
      filter === 'all' || filter === kind;

    const result: SpotlightAction[] = [];
    const statics: StaticTarget[] = [
      ...(show('collections') ? matchedStatic.collections : []),
      ...(show('data-sources') ? matchedStatic.dataSources : []),
      ...(show('releases') ? matchedStatic.releases : []),
    ];
    for (const target of statics) {
      result.push(buildStaticAction(target, () => navigate(target.url)));
    }

    if (show('docs')) {
      for (const hit of docSlugHits) {
        const url = `/cms/content/${hit.collection}/${encodeURIComponent(
          hit.slug
        )}`;
        result.push(buildDocSlugAction(hit, () => navigate(url)));
      }
    }

    if (show('fields')) {
      for (const hit of fieldHits) {
        const url = `/cms/content/${hit.collection}/${encodeURIComponent(
          hit.slug
        )}?deeplink=${encodeURIComponent(hit.deepKey)}`;
        result.push(buildFieldHitAction(hit, () => navigate(url)));
      }
    }
    return result;
  }, [
    trimmedQuery,
    filter,
    fieldHits,
    docSlugHits,
    matchedStatic,
    recentViews,
    location,
  ]);

  const lastIndexed = formatLastIndexed(status);

  // Compose the "nothing found" message based on state.
  const loading = fieldLoading || slugLoading;
  const nothingFoundMessage = useMemo(() => {
    if (loading) {
      return 'Searching…';
    }
    if (!trimmedQuery) {
      return 'Type to search docs, collections, data sources and releases.';
    }
    if (filter !== 'all' && totalCount > 0) {
      return (
        <span>
          No {getGlobalSearchFilterLabel(filter).toLowerCase()} match.{' '}
          <button
            type="button"
            className="GlobalSearch__resetFilter"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onFilterChange('all')}
          >
            Show all results
          </button>
        </span>
      );
    }
    return 'No results. Try fewer words, or "quotes" for an exact phrase.';
  }, [loading, trimmedQuery, filter, totalCount, onFilterChange]);

  const onCopyLink = useCallback(
    () => copySearchLink({query: trimmedQuery, filter}),
    [trimmedQuery, filter]
  );

  const bodyCtx = useMemo<BodyContextValue>(
    () => ({
      filtersVisible: !!trimmedQuery,
      filter,
      onFilterChange,
      counts,
      onCopyLink,
      // Mantine renders the results area when there are actions or a
      // "nothing found" message, i.e. whenever there's a query.
      footerVisible: !!trimmedQuery || actions.length > 0,
      lastIndexed: trimmedQuery ? lastIndexed : null,
    }),
    [
      trimmedQuery,
      filter,
      onFilterChange,
      counts,
      onCopyLink,
      actions,
      lastIndexed,
    ]
  );

  // Pass-through filter: server already ranks/filters and our static-target
  // filter is computed above; we don't want Spotlight's built-in title/
  // description filter to drop our results.
  const filterAll = (_q: string, list: SpotlightAction[]) => list;

  return (
    <BODY_CONTEXT.Provider value={bodyCtx}>
      <Spotlight
        opened={opened}
        onClose={props.onClose}
        query={query}
        onQueryChange={onQueryChange}
        actions={actions}
        transitionDuration={TRANSITION_MS}
        classNames={{
          spotlight: 'GlobalSearch__spotlight',
          searchInput: 'GlobalSearch__input',
          actions: 'GlobalSearch__actions',
          actionsGroup: 'GlobalSearch__group',
          nothingFound: 'GlobalSearch__nothingFound',
        }}
        radius="md"
        shadow="xl"
        overlayOpacity={0.28}
        overlayBlur={2}
        maxWidth={640}
        searchPlaceholder="Search docs, collections, releases…"
        searchIcon={<IconSearch size={18} />}
        nothingFoundMessage={nothingFoundMessage}
        filter={filterAll}
        actionComponent={GlobalSearchAction}
        actionsWrapperComponent={GlobalSearchBody}
        limit={50}
        withinPortal
      />
      {props.children}
    </BODY_CONTEXT.Provider>
  );
}

/**
 * Wraps children in a Mantine Spotlight bound to `mod + K`. Surfaces:
 *  - Recently viewed CMS objects (when the query is empty)
 *  - Collections, data sources, and active releases by name
 *  - Documents by slug or `<collection>/<slug>` id
 *  - Field text hits from the server-side MiniSearch index
 *
 * Results can be narrowed by type with the filter tabs, and the open state,
 * query, and filter are mirrored into the URL so a search can be deep linked
 * and shared, e.g. `/cms/?modal=search&q=foo&type=docs`.
 *
 * The inner `Spotlight` component is rendered directly (rather than through
 * `SpotlightProvider`) so the query state lives here and can be prefilled.
 */
export function GlobalSearch(props: {children: ComponentChildren}) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GlobalSearchFilter>('all');
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const clearTimerRef = useRef(0);
  const urlTimerRef = useRef(0);

  const open = useCallback((options: OpenGlobalSearchOptions = {}) => {
    window.clearTimeout(clearTimerRef.current);
    setQuery(options.query ?? '');
    setFilter(options.filter ?? 'all');
    setOpened(true);
  }, []);

  const close = useCallback(() => {
    window.clearTimeout(urlTimerRef.current);
    setOpened(false);
    clearSearchUrlState();
    // Clear the query once the close transition has finished so the results
    // don't visibly flash away while the modal is still fading out.
    clearTimerRef.current = window.setTimeout(() => {
      setQuery('');
      setFilter('all');
    }, TRANSITION_MS);
  }, []);

  // Open requests from `openGlobalSearch()` (e.g. the sidebar search bar).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenGlobalSearchOptions>).detail;
      open(detail || {});
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [open]);

  // Custom Cmd/Ctrl+K handler. We can't use Mantine's built-in `shortcut`
  // prop because its `useHotkeys` only ignores INPUT/TEXTAREA/SELECT — not
  // `contenteditable` rich text fields. Lexical binds Cmd+K to "insert link",
  // so opening the global search at the same time clobbers that. Skip the
  // shortcut whenever focus is inside any editable field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isModK =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === 'k' || event.code === 'KeyK');
      if (!isModK) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      open();
    };
    document.documentElement.addEventListener('keydown', onKeyDown);
    return () =>
      document.documentElement.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Deep links: open the modal when the URL carries `?modal=search`, both on
  // the initial page load and on client-side navigations (e.g. the browser
  // back button returning to a URL that had the search open). NOTE:
  // `useLocation()` is what makes this reactive to client-side URL changes.
  const {url} = useLocation();
  useEffect(() => {
    const state = readGlobalSearchUrlState(window.location.search);
    if (!state || openedRef.current) {
      return;
    }
    open(state);
  }, [url, open]);

  // Mirror the open state, query, and filter into the URL so the current
  // search can be shared straight from the address bar.
  useEffect(() => {
    if (!opened) {
      return;
    }
    window.clearTimeout(urlTimerRef.current);
    urlTimerRef.current = window.setTimeout(() => {
      const search = window.location.search;
      const next = writeGlobalSearchUrlState(search, {
        query: query.trim(),
        filter,
      });
      if (next !== search) {
        replaceUrlSearch(next);
      }
    }, URL_SYNC_DEBOUNCE_MS);
  }, [opened, query, filter]);

  // Place the caret at the end of a prefilled query so it can be refined
  // without first moving the cursor.
  useEffect(() => {
    if (!opened || !query) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        '.GlobalSearch__spotlight input'
      );
      if (input && document.activeElement === input) {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
    return () => window.cancelAnimationFrame(handle);
    // Only runs when the modal opens; edits move the caret themselves.
  }, [opened]);

  return (
    <GlobalSearchInner
      opened={opened}
      query={query}
      filter={filter}
      onQueryChange={setQuery}
      onFilterChange={setFilter}
      onClose={close}
    >
      {props.children}
    </GlobalSearchInner>
  );
}
