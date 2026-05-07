import {
  collection,
  documentId,
  endAt,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';

export interface GlobalSearchHit {
  id: string;
  docId: string;
  collection: string;
  slug: string;
  deepKey: string;
  fieldLabel: string;
  fieldType: string;
  text: string;
  score: number;
  terms: string[];
}

export interface GlobalSearchStatus {
  lastRun: number | null;
  docCount: number;
  fieldCount: number;
  shardCount: number;
}

export interface UseGlobalSearchResult {
  hits: GlobalSearchHit[];
  loading: boolean;
  error: string | null;
  status: GlobalSearchStatus | null;
}

const DEBOUNCE_MS = 200;
const DEFAULT_LIMIT = 25;
/** Minimum chars before we hit `/cms/api/search.query` (avoids noisy 1-letter
 * matches that prefix-match nearly every doc). */
const DEFAULT_MIN_QUERY_LENGTH = 2;

/**
 * Debounced fetch hook for the global search endpoint.
 *
 * The MiniSearch index lives server-side; this hook does no client-side
 * indexing. Each non-empty query produces a single POST to
 * `/cms/api/search.query`; in-flight requests are aborted when a newer query
 * arrives.
 */
export function useGlobalSearch(
  query: string,
  options: {limit?: number; minQueryLength?: number} = {}
): UseGlobalSearchResult {
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GlobalSearchStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minLen = options.minQueryLength ?? DEFAULT_MIN_QUERY_LENGTH;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLen) {
      // Cancel anything in flight, clear state.
      abortRef.current?.abort();
      abortRef.current = null;
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch('/cms/api/search.query', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({q: trimmed, limit}),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`search.query returned ${res.status}`);
        }
        const data = await res.json();
        if (!data?.success) {
          throw new Error(data?.error || 'search failed');
        }
        if (controller.signal.aborted) {
          return;
        }
        setHits(Array.isArray(data.hits) ? data.hits : []);
        setStatus(data.meta || null);
        setLoading(false);
      } catch (err: any) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('global search failed:', err);
        setError(String(err?.message || err));
        setHits([]);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [query, limit, minLen]);

  return {hits, loading, error, status};
}

export interface SearchIndexAdminStatus {
  status: GlobalSearchStatus;
  running: boolean;
}

/**
 * Polls `/cms/api/search.status` and exposes a `refresh()` for manual reads.
 * Used by the Settings page Site Admin section.
 */
export function useSearchIndexStatus(): SearchIndexAdminStatus & {
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<SearchIndexAdminStatus>({
    status: {lastRun: null, docCount: 0, fieldCount: 0, shardCount: 0},
    running: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/cms/api/search.status', {
        method: 'GET',
        headers: {'Content-Type': 'application/json'},
      });
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      if (!json?.success) {
        return;
      }
      setData({
        status: json.status,
        running: !!json.running,
      });
    } catch (err) {
      console.error('search.status failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {...data, loading, refresh};
}

export interface DocSlugHit {
  collection: string;
  slug: string;
  /** "<collection>/<slug>" */
  docId: string;
}

export interface UseDocSlugSearchResult {
  hits: DocSlugHit[];
  loading: boolean;
}

const SLUG_DEBOUNCE_MS = 200;
const PER_COLLECTION_LIMIT = 5;
const SLUG_MIN_QUERY_LENGTH = 2;

/**
 * Looks up CMS docs by slug (or `<collection>/<slug>` doc id) prefix using
 * Firestore range queries on each collection's `Drafts` subcollection.
 *
 * Slug-only queries (e.g. `home`) fan out across every registered collection;
 * a `<collection>/<slug>` form (e.g. `Pages/home`) restricts the lookup to a
 * single collection. Queries shorter than `minQueryLength` (default 2) are
 * skipped to avoid fanning out across every collection on a single keystroke.
 */
export function useDocSlugSearch(
  rawQuery: string,
  options: {limit?: number; minQueryLength?: number} = {}
): UseDocSlugSearchResult {
  const [hits, setHits] = useState<DocSlugHit[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<{aborted: boolean} | null>(null);
  const totalLimit = options.limit ?? 10;
  const minLen = options.minQueryLength ?? SLUG_MIN_QUERY_LENGTH;

  useEffect(() => {
    const trimmed = rawQuery.trim();
    // For `<coll>/<slug>` queries the prefix is what's *after* the slash, so
    // gate on that piece rather than the raw query length (otherwise typing
    // `Pages/h` would be skipped at length 7).
    const slashIdx = trimmed.indexOf('/');
    const probe = slashIdx >= 0 ? trimmed.slice(slashIdx + 1) : trimmed;
    if (probe.length < minLen) {
      if (cancelRef.current) {
        cancelRef.current.aborted = true;
      }
      cancelRef.current = null;
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const handle = window.setTimeout(async () => {
      if (cancelRef.current) {
        cancelRef.current.aborted = true;
      }
      const ctrl = {aborted: false};
      cancelRef.current = ctrl;

      let collFilter: string | null = null;
      let prefix = trimmed;
      if (slashIdx >= 0) {
        collFilter = trimmed.slice(0, slashIdx);
        prefix = trimmed.slice(slashIdx + 1);
      }

      const projectId = window.__ROOT_CTX?.rootConfig?.projectId;
      const db = window.firebase?.db;
      if (!projectId || !db) {
        setHits([]);
        setLoading(false);
        return;
      }

      const allColls = Object.keys(window.__ROOT_CTX.collections || {});
      const colls = collFilter
        ? allColls.filter((c) => c.toLowerCase() === collFilter!.toLowerCase())
        : allColls;

      // Inclusive Firestore range bounds for a prefix match. The
      // `` character is a high private-use codepoint that sorts
      // after any normal slug character.
      const lower = prefix;
      const upper = `${prefix}`;

      try {
        const queries = colls.map(async (collId) => {
          const ref = collection(
            db,
            'Projects',
            projectId,
            'Collections',
            collId,
            'Drafts'
          );
          const q = query(
            ref,
            orderBy(documentId()),
            startAt(lower),
            endAt(upper),
            fbLimit(PER_COLLECTION_LIMIT)
          );
          try {
            const snap = await getDocs(q);
            const out: DocSlugHit[] = [];
            snap.forEach((d) => {
              out.push({
                collection: collId,
                slug: d.id,
                docId: `${collId}/${d.id}`,
              });
            });
            return out;
          } catch (err) {
            // Some Firestore instances reject documentId range filters in
            // narrow contexts; swallow per-collection failures rather than
            // taking down the whole spotlight.
            console.error(`docSlugSearch failed for ${collId}:`, err);
            return [];
          }
        });
        const results = (await Promise.all(queries)).flat();
        if (ctrl.aborted) {
          return;
        }
        // Rank exact slug or docId matches first, then prefix matches
        // alphabetically so results are stable across renders.
        const sorted = results.sort((a, b) => {
          const aExact = a.slug === prefix || a.docId === trimmed ? 0 : 1;
          const bExact = b.slug === prefix || b.docId === trimmed ? 0 : 1;
          if (aExact !== bExact) {
            return aExact - bExact;
          }
          return a.docId.localeCompare(b.docId);
        });
        setHits(sorted.slice(0, totalLimit));
        setLoading(false);
      } catch (err) {
        if (ctrl.aborted) {
          return;
        }
        console.error('docSlugSearch failed:', err);
        setHits([]);
        setLoading(false);
      }
    }, SLUG_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [rawQuery, totalLimit, minLen]);

  return {hits, loading};
}
