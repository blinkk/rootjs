import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useRef, useState} from 'preact/hooks';
import {Release, listReleases} from '../utils/release.js';

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
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchState = useRef<'idle' | 'fetching' | 'done'>('idle');

  function fetchReleases() {
    if (fetchState.current !== 'idle') {
      return;
    }
    fetchState.current = 'fetching';
    setLoading(true);
    listReleases()
      .then((allReleases) => {
        const pending = allReleases.filter(
          (r) => !r.publishedAt && !r.archivedAt
        );
        setReleases(pending);
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
  // calls use cached values.
  useEffect(() => {
    fetchReleases();
  }, []);
  return value;
}
