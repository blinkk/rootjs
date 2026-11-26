import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {lazyComponent} from '../../../app/lazy-component.js';
import {isEditableTarget} from '../../../utils/keyboard.js';
import {recentViewFromUrl, recordRecentView} from '../recent-views.js';
import type {GlobalSearchDialogProps} from './GlobalSearchDialog.js';
import {
  GlobalSearchFilter,
  readGlobalSearchUrlState,
  writeGlobalSearchUrlState,
} from './search-filters.js';

const LazyGlobalSearchDialog = lazyComponent<GlobalSearchDialogProps>(
  () => import('./GlobalSearchDialog.js').then((m) => m.GlobalSearchDialog),
  {fallback: null}
);

/** Preloads the global search dialog chunk without mounting it. */
export function preloadGlobalSearch(): Promise<void> {
  return LazyGlobalSearchDialog.preload();
}

/** Custom event used by `openGlobalSearch()` to reach the provider. */
const OPEN_EVENT = 'rootcms:open-global-search';

/** Delay before the query is cleared after closing. */
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

/**
 * Command palette bound to `mod + K`, in a `Dialog` (full screen on mobile).
 * Keeps only the lightweight shortcut, URL-sync, and recent-views listeners in
 * the startup bundle; the dialog UI and its Firestore/search queries load and
 * mount lazily on first open.
 */
export function GlobalSearch() {
  const [opened, setOpened] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [chunkLoaded, setChunkLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GlobalSearchFilter>('all');
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const clearTimerRef = useRef(0);
  const urlTimerRef = useRef(0);

  // Warm the dialog chunk while the browser is idle so first Cmd+K opens
  // immediately without mounting or running Firestore queries ahead of time.
  useEffect(() => {
    let cancelled = false;
    const warm = () => {
      preloadGlobalSearch()
        .then(() => {
          if (!cancelled) {
            setChunkLoaded(true);
          }
        })
        .catch(() => {
          // Ignore idle preload failures; opening retries on demand.
        });
    };
    const w = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: {timeout: number}
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(warm, {timeout: 2000});
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(warm, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const open = useCallback((options: OpenGlobalSearchOptions = {}) => {
    window.clearTimeout(clearTimerRef.current);
    setQuery(options.query ?? '');
    setFilter(options.filter ?? 'all');
    setHasOpened(true);
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

  // Track route changes and record CMS object views so they show up as
  // recent results in the search even before the modal has been opened.
  useEffect(() => {
    const view = recentViewFromUrl(url);
    if (view) {
      recordRecentView(view);
    }
  }, [url]);

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

  // Keep the dialog mounted after first open once loaded so close transitions
  // finish smoothly; if loading fails before opening, closing unmounts the
  // fallback error UI instead of leaving it at the bottom of the page.
  if (!hasOpened || (!opened && !chunkLoaded)) {
    return null;
  }

  return (
    <LazyGlobalSearchDialog
      opened={opened}
      query={query}
      filter={filter}
      onQueryChange={setQuery}
      onFilterChange={setFilter}
      onClose={close}
    />
  );
}
