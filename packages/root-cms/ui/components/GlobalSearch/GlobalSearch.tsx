import './GlobalSearch.css';
import {SpotlightProvider, SpotlightAction} from '@mantine/spotlight';
import {IconSearch} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useMemo, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {
  GlobalSearchHit,
  GlobalSearchStatus,
  useGlobalSearch,
} from '../../hooks/useGlobalSearch.js';
import {GlobalSearchAction} from './GlobalSearchAction.js';

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

function buildAction(
  hit: GlobalSearchHit,
  onTrigger: () => void
): SpotlightAction {
  return {
    id: hit.id,
    title: hit.text || hit.fieldLabel,
    description: `${hit.collection} · ${hit.slug} · ${hit.fieldLabel}`,
    keywords: [hit.collection, hit.slug, hit.fieldLabel],
    onTrigger,
    // Pass-through fields consumed by GlobalSearchAction.
    hit,
  };
}

function GlobalSearchInner(props: {
  children: ComponentChildren;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const {query, onQueryChange} = props;
  const location = useLocation();
  const {hits, loading, error, status} = useGlobalSearch(query);

  const lastIndexed = formatLastIndexed(status);

  // Build SpotlightActions whenever results change. The onTrigger closure
  // captures the current `route` so navigation works as expected.
  const actions: SpotlightAction[] = useMemo(() => {
    return hits.map((hit) => {
      const url = `/cms/content/${hit.collection}/${encodeURIComponent(
        hit.slug
      )}?deeplink=${encodeURIComponent(hit.deepKey)}`;
      return buildAction(hit, () => {
        location.route(url);
      });
    });
  }, [hits, location]);

  // Compose the "nothing found" message based on state.
  const nothingFoundMessage = useMemo(() => {
    if (loading) {
      return 'Searching…';
    }
    if (error) {
      return `Search failed: ${error}`;
    }
    if (!query.trim()) {
      return 'Type to search docs.';
    }
    return 'No results.';
  }, [loading, error, query]);

  // Append a footer-like action that's never triggerable to surface the
  // last-indexed timestamp at the bottom of the spotlight.
  const augmented = useMemo(() => {
    if (!lastIndexed) {
      return actions;
    }
    return [
      ...actions,
      {
        id: '__last-indexed__',
        title: '',
        description: '',
        keywords: '__internal__',
        // No-op: clicking does nothing.
        onTrigger: () => {},
        // Marker consumed by GlobalSearchAction to render footer styling.
        __footer: true,
        lastIndexed,
      } as SpotlightAction,
    ];
  }, [actions, lastIndexed]);

  // Pass-through filter: server already ranks/filters; we don't want the
  // built-in title/description filter to drop our results.
  const filterAll = (_q: string, list: SpotlightAction[]) => list;

  return (
    <SpotlightProvider
      actions={augmented}
      shortcut={['mod + K']}
      onQueryChange={onQueryChange}
      searchPlaceholder="Search docs and fields…"
      searchIcon={<IconSearch size={18} />}
      nothingFoundMessage={nothingFoundMessage}
      filter={filterAll}
      actionComponent={GlobalSearchAction}
      limit={50}
      cleanQueryOnClose
      withinPortal
    >
      {props.children}
    </SpotlightProvider>
  );
}

/**
 * Wraps children in a Mantine Spotlight bound to `mod + K`. Renders search
 * results that, when clicked, navigate the doc editor with a `?deeplink=…`
 * query param (handled by `useDeeplink`).
 */
export function GlobalSearch(props: {children: ComponentChildren}) {
  const [query, setQuery] = useState('');
  return (
    <GlobalSearchInner query={query} onQueryChange={setQuery}>
      {props.children}
    </GlobalSearchInner>
  );
}
