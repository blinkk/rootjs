import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useRef, useState} from 'preact/hooks';
import {
  Release,
  getCachedReleases,
  isPendingRelease,
  listReleasesFromCacheOrFetch,
  subscribeToReleases,
} from '../utils/release.js';

export interface PendingReleasesContextValue {
  /** All pending (unpublished, unarchived) releases. */
  releases: Release[];
  /** Returns the pending releases that contain the given docId. */
  getReleasesForDoc: (docId: string) => Release[];
  loading: boolean;
}

const PendingReleasesContext = createContext<InternalContextValue | null>(null);

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

  function fetchReleases() {
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
  }

  function getReleasesForDoc(docId: string): Release[] {
    return releases.filter((r) => r.docIds?.includes(docId));
  }

  return (
    <PendingReleasesContext.Provider
      value={{
        releases,
        getReleasesForDoc,
        loading,
        fetchReleases,
      }}
    >
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
