import {ComponentChildren, createContext} from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';
import {
  Release,
  getCachedReleases,
  isPendingRelease,
  listReleasesFromCacheOrFetch,
  subscribeToReleases,
} from './release.js';

export interface PendingReleasesContextValue {
  /** All pending (unpublished, unarchived) releases. */
  releases: Release[];
  /** Returns the pending releases that contain the given docId. */
  getReleasesForDoc: (docId: string) => Release[];
  loading: boolean;
}

const PendingReleasesContext = createContext<InternalContextValue | null>(null);

const EMPTY_RELEASES: Release[] = [];

interface InternalContextValue extends PendingReleasesContextValue {
  fetchReleases: () => void;
}

export function PendingReleasesProvider(props: {children?: ComponentChildren}) {
  const [releases, setReleases] = useState<Release[]>(() =>
    (getCachedReleases() || []).filter(isPendingRelease)
  );
  const [loading, setLoading] = useState(false);
  const fetchState = useRef<'idle' | 'fetching' | 'done'>('idle');

  // Keep the pending releases in sync with the shared releases cache so that
  // release mutations (e.g. adding docs to a release) are reflected everywhere
  // without requiring a page refresh.
  useEffect(() => {
    return subscribeToReleases((allReleases) => {
      setReleases(allReleases.filter(isPendingRelease));
    });
  }, []);

  const fetchReleases = useCallback(() => {
    if (fetchState.current !== 'idle') {
      return;
    }
    fetchState.current = 'fetching';
    setLoading(true);
    listReleasesFromCacheOrFetch()
      .then((allReleases) => {
        setReleases(allReleases.filter(isPendingRelease));
      })
      .catch((err) => {
        console.error('Failed to fetch pending releases:', err);
      })
      .finally(() => {
        fetchState.current = 'done';
        setLoading(false);
      });
  }, []);

  const releasesByDocId = useMemo(() => {
    const map = new Map<string, Release[]>();
    for (const release of releases) {
      if (!release.docIds) {
        continue;
      }
      for (const docId of release.docIds) {
        let list = map.get(docId);
        if (!list) {
          list = [];
          map.set(docId, list);
        }
        list.push(release);
      }
    }
    return map;
  }, [releases]);

  const getReleasesForDoc = useCallback(
    (docId: string): Release[] => releasesByDocId.get(docId) ?? EMPTY_RELEASES,
    [releasesByDocId]
  );

  const contextValue = useMemo<InternalContextValue>(
    () => ({
      releases,
      getReleasesForDoc,
      loading,
      fetchReleases,
    }),
    [releases, getReleasesForDoc, loading, fetchReleases]
  );

  return (
    <PendingReleasesContext.Provider value={contextValue}>
      {props.children}
    </PendingReleasesContext.Provider>
  );
}

export function usePendingReleases(): PendingReleasesContextValue {
  const context = useContext(PendingReleasesContext);
  if (!context) {
    throw new Error(
      'usePendingReleases must be used within a <PendingReleasesProvider>'
    );
  }
  const {fetchReleases, ...value} = context;
  // Releases are only fetched the first time this hook is used. Subsequent
  // calls use the cached values, which are kept up to date as releases are
  // mutated.
  useEffect(() => {
    fetchReleases();
  }, []);
  return value;
}
