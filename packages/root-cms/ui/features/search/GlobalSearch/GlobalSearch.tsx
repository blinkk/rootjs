import './GlobalSearch.css';
import {IconSearch, IconX} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {Dialog} from '../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../primitives/IconButton/IconButton.js';
import {Kbd} from '../../../primitives/Kbd/Kbd.js';
import {isEditableTarget} from '../../../utils/keyboard.js';
import {showErrorNotification} from '../../../utils/notifications.js';
import {DataSource, listDataSources} from '../../data-sources/data-source.js';
import {usePendingReleases} from '../../releases/usePendingReleases.js';
import {
  RecentView,
  recentViewFromUrl,
  recordRecentView,
  useRecentViews,
} from '../recent-views.js';
import {
  DocSlugHit,
  GlobalSearchHit,
  GlobalSearchStatus,
  useDocSlugSearch,
  useGlobalSearch,
} from '../useGlobalSearch.js';
import {
  GlobalSearchAction,
  GlobalSearchActionMeta,
  GlobalSearchItem,
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
 * Result group labels, rendered as headers above each group, in the order
 * the groups first appear in the results.
 */
const GROUP_RECENT = 'Recently viewed';
const GROUP_STATIC = 'Jump to';
const GROUP_DOCS = 'Documents';
const GROUP_FIELDS = 'Field matches';

function buildFieldHitAction(
  hit: GlobalSearchHit,
  onTrigger: () => void
): GlobalSearchItem {
  const meta: GlobalSearchActionMeta = {kind: 'field', hit};
  return {
    id: `field:${hit.id}`,
    group: GROUP_FIELDS,
    onTrigger,
    meta,
  };
}

function buildDocSlugAction(
  hit: DocSlugHit,
  onTrigger: () => void
): GlobalSearchItem {
  const meta: GlobalSearchActionMeta = {kind: 'doc', hit};
  return {
    id: `doc:${hit.docId}`,
    group: GROUP_DOCS,
    onTrigger,
    meta,
  };
}

function buildStaticAction(
  target: StaticTarget,
  onTrigger: () => void
): GlobalSearchItem {
  const meta: GlobalSearchActionMeta = {kind: 'target', target};
  return {
    id: `${target.kind}:${target.id}`,
    group: GROUP_STATIC,
    onTrigger,
    meta,
  };
}

function buildRecentAction(
  view: RecentView,
  onTrigger: () => void
): GlobalSearchItem {
  const meta: GlobalSearchActionMeta = {kind: 'recent', view};
  return {
    id: `recent:${view.url}`,
    group: GROUP_RECENT,
    onTrigger,
    meta,
  };
}

/** Custom event used by `openGlobalSearch()` to reach the provider. */
const OPEN_EVENT = 'rootcms:open-global-search';

/** Delay before the query is cleared after closing. */
const TRANSITION_MS = 150;

/** Maximum number of results listed. */
const RESULTS_LIMIT = 50;

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

/** Keyboard and search syntax hints shown in the footer. */
const FOOTER_HINTS: Array<[string, string]> = [
  ['↑↓', 'navigate'],
  ['↵', 'open'],
  ['"…"', 'exact phrase'],
  ['-word', 'exclude'],
  ['coll/slug', 'jump to doc'],
];

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

  // Lazy-fetch data sources once when the search mounts. Failures
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

  // Static search targets: collections (always present), data sources, and
  // active releases (pending = not published, not archived).
  const staticTargets = useMemo<StaticTarget[]>(() => {
    return [
      ...buildCollectionTargets(),
      ...buildDataSourceTargets(dataSources),
      ...buildReleaseTargets(pendingReleases),
    ];
  }, [dataSources, pendingReleases]);

  // Track route changes and record CMS object views so they show up as
  // recent results in the search.
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
  const actions: GlobalSearchItem[] = useMemo(() => {
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

    const result: GlobalSearchItem[] = [];
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
    return result.slice(0, RESULTS_LIMIT);
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

  const footerVisible = !!trimmedQuery || actions.length > 0;
  const showLastIndexed = trimmedQuery ? lastIndexed : null;

  // Keyboard navigation: the input keeps focus and the active option is
  // tracked here (`aria-activedescendant`), as in a combobox.
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [actions]);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const trigger = (item: GlobalSearchItem) => {
    props.onClose();
    item.onTrigger();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) {
      return;
    }
    const count = actions.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (count > 0) {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((i) => (i + step + count) % count);
      }
    } else if (e.key === 'Enter') {
      const item = actions[activeIndex];
      if (item) {
        e.preventDefault();
        trigger(item);
      }
    } else if (e.key === 'Escape') {
      // Handled here rather than by the dialog's `cancel` event, which the
      // prevented keydown suppresses.
      e.preventDefault();
      props.onClose();
    }
  };

  const showList = !!trimmedQuery || actions.length > 0;

  return (
    <>
      <Dialog
        open={opened}
        onClose={props.onClose}
        aria-label="Search"
        size={640}
        withCloseButton={false}
        className="GlobalSearch max-md:pt-0"
        classNames={{
          panel: 'GlobalSearch__panel max-md:h-full max-md:rounded-none',
          body: 'GlobalSearch__body flex flex-col overflow-hidden p-0',
        }}
      >
        <div className="GlobalSearch__header flex shrink-0 items-center gap-2 pl-4 pr-2 md:pr-4">
          <IconSearch
            className="GlobalSearch__icon shrink-0 text-muted"
            size={18}
          />
          <input
            className="GlobalSearch__input h-13 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-sans text-base text-fg outline-none placeholder:text-muted"
            type="text"
            role="combobox"
            aria-label="Search"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              actions[activeIndex] ? optionId(activeIndex) : undefined
            }
            autoComplete="off"
            spellcheck={false}
            data-autofocus
            placeholder="Search docs, collections, releases…"
            value={query}
            onInput={(e) => onQueryChange(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <Kbd
            className="GlobalSearch__esc hidden text-muted md:inline-flex"
            aria-hidden="true"
          >
            esc
          </Kbd>
          <IconButton
            className="GlobalSearch__close md:hidden"
            label="Close search"
            size="md"
            tooltip={false}
            onClick={props.onClose}
          >
            <IconX />
          </IconButton>
        </div>
        {trimmedQuery && (
          <GlobalSearchFilters
            value={filter}
            onChange={onFilterChange}
            counts={counts}
            onCopyLink={onCopyLink}
          />
        )}
        {showList && (
          <div
            className="GlobalSearch__results min-h-0 flex-1 overflow-y-auto overscroll-contain"
            id={listboxId}
            role="listbox"
            aria-label="Results"
          >
            {actions.length > 0 ? (
              <div className="GlobalSearch__actions pb-1.5 pt-1">
                {actions.map((item, i) => (
                  <div key={item.id} role="presentation">
                    {item.group !== actions[i - 1]?.group && (
                      <div
                        className="GlobalSearch__group px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted"
                        role="presentation"
                      >
                        {item.group}
                      </div>
                    )}
                    <GlobalSearchAction
                      item={item}
                      id={optionId(i)}
                      active={i === activeIndex}
                      onTrigger={() => trigger(item)}
                      onHover={() => setActiveIndex(i)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="GlobalSearch__nothingFound px-4 py-5 text-sm text-muted">
                {nothingFoundMessage}
              </div>
            )}
          </div>
        )}
        {footerVisible && (
          <div className="GlobalSearch__footer hidden min-h-8 shrink-0 items-center gap-3.5 overflow-hidden whitespace-nowrap border-0 border-t border-solid border-border bg-page px-4 py-1.5 text-xs text-muted md:flex">
            {FOOTER_HINTS.map(([key, label]) => (
              <span
                key={key}
                className="GlobalSearch__hint inline-flex items-center gap-1"
              >
                <Kbd className="GlobalSearch__kbd">{key}</Kbd>
                {label}
              </span>
            ))}
            {showLastIndexed && (
              <span className="GlobalSearch__indexed ml-auto text-subtle">
                Indexed {showLastIndexed}
              </span>
            )}
          </div>
        )}
      </Dialog>
      {props.children}
    </>
  );
}

/**
 * Wraps children in a command palette bound to `mod + K`, in a `Dialog`
 * (full screen on mobile). Surfaces:
 *  - Recently viewed CMS objects (when the query is empty)
 *  - Collections, data sources, and active releases by name
 *  - Documents by slug or `<collection>/<slug>` id
 *  - Field text hits from the server-side MiniSearch index
 *
 * Results can be narrowed by type with the filter tabs, and the open state,
 * query, and filter are mirrored into the URL so a search can be deep linked
 * and shared, e.g. `/cms/?modal=search&q=foo&type=docs`.
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

  // Cmd/Ctrl+K handler. Lexical binds Cmd+K to "insert link", so opening the
  // global search at the same time would clobber that: skip the shortcut
  // whenever focus is inside any editable field.
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
        '.GlobalSearch__input'
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
