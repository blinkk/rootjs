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
  options: {limit?: number} = {}
): UseGlobalSearchResult {
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<GlobalSearchStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const limit = options.limit ?? DEFAULT_LIMIT;

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
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
  }, [query, limit]);

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
