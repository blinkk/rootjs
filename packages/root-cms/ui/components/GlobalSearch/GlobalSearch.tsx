import './GlobalSearch.css';
import {SpotlightProvider, SpotlightAction} from '@mantine/spotlight';
import {IconSearch} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
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
        haystack: [id, label, description].filter(Boolean).join(' ').toLowerCase(),
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
    if (t.id.toLowerCase().startsWith(q) || t.label.toLowerCase().startsWith(q)) {
      prefix.push(t);
    } else if (t.haystack.includes(q)) {
      substr.push(t);
    }
  }
  return [...prefix, ...substr];
}

function buildFieldHitAction(
  hit: GlobalSearchHit,
  onTrigger: () => void
): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'field', hit};
  return {
    id: `field:${hit.id}`,
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
    title: view.label,
    description: view.description || '',
    keywords: [view.label, view.description || '', view.url],
    onTrigger,
    meta,
  };
}

function buildHeader(id: string, label: string): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'header', label};
  return {
    id: `header:${id}`,
    title: label,
    description: '',
    keywords: '__internal__',
    onTrigger: () => {},
    meta,
  };
}

function buildFooter(lastIndexed: string): SpotlightAction {
  const meta: GlobalSearchActionMeta = {kind: 'footer', lastIndexed};
  return {
    id: '__last-indexed__',
    title: '',
    description: '',
    keywords: '__internal__',
    onTrigger: () => {},
    meta,
  };
}

function GlobalSearchInner(props: {
  children: ComponentChildren;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const {query, onQueryChange} = props;
  const location = useLocation();
  const trimmedQuery = query.trim();
  const {hits: fieldHits, loading: fieldLoading, status} =
    useGlobalSearch(query);
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

  // When the query is empty, surface recent views; when populated, compose
  // matches across static targets, doc slug lookups, and field text hits.
  const actions: SpotlightAction[] = useMemo(() => {
    if (!trimmedQuery) {
      if (recentViews.length === 0) {
        return [];
      }
      return [
        buildHeader('recent', 'Recently viewed'),
        ...recentViews.map((view) =>
          buildRecentAction(view, () => navigate(view.url))
        ),
      ];
    }

    const result: SpotlightAction[] = [];
    const matchedStatic = filterStaticTargets(staticTargets, trimmedQuery);
    if (matchedStatic.length > 0) {
      result.push(buildHeader('static', 'Jump to'));
      for (const target of matchedStatic) {
        result.push(buildStaticAction(target, () => navigate(target.url)));
      }
    }

    if (docSlugHits.length > 0) {
      result.push(buildHeader('docs', 'Documents'));
      for (const hit of docSlugHits) {
        const url = `/cms/content/${hit.collection}/${encodeURIComponent(
          hit.slug
        )}`;
        result.push(buildDocSlugAction(hit, () => navigate(url)));
      }
    }

    if (fieldHits.length > 0) {
      result.push(buildHeader('fields', 'Field matches'));
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
    fieldHits,
    docSlugHits,
    staticTargets,
    recentViews,
    location,
  ]);

  const lastIndexed = formatLastIndexed(status);
  const augmented = useMemo(() => {
    // The "last indexed" footer is only meaningful while the user is actively
    // querying the index. When the query is empty (recent views) or there are
    // no results, we suppress it so the surface stays clean.
    if (!lastIndexed || !trimmedQuery || actions.length === 0) {
      return actions;
    }
    return [...actions, buildFooter(lastIndexed)];
  }, [actions, lastIndexed, trimmedQuery]);

  // Compose the "nothing found" message based on state.
  const loading = fieldLoading || slugLoading;
  const nothingFoundMessage = useMemo(() => {
    if (loading) {
      return 'Searching…';
    }
    if (!trimmedQuery) {
      return 'Type to search docs, collections, releases…';
    }
    return 'No results.';
  }, [loading, trimmedQuery]);

  // Pass-through filter: server already ranks/filters and our static-target
  // filter is computed above; we don't want Spotlight's built-in title/
  // description filter to drop our results.
  const filterAll = (_q: string, list: SpotlightAction[]) => list;

  return (
    <SpotlightProvider
      actions={augmented}
      shortcut={['mod + K']}
      onQueryChange={onQueryChange}
      searchPlaceholder="Search docs, collections, releases…"
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
 * Wraps children in a Mantine Spotlight bound to `mod + K`. Surfaces:
 *  - Recently viewed CMS objects (when the query is empty)
 *  - Collections, data sources, and active releases by name
 *  - Documents by slug or `<collection>/<slug>` id
 *  - Field text hits from the server-side MiniSearch index
 */
export function GlobalSearch(props: {children: ComponentChildren}) {
  const [query, setQuery] = useState('');
  return (
    <GlobalSearchInner query={query} onQueryChange={setQuery}>
      {props.children}
    </GlobalSearchInner>
  );
}

