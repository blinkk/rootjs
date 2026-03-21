import {ComponentChildren, createContext} from 'preact';
import {useContext, useEffect, useState} from 'preact/hooks';
import {Release, listReleases} from '../utils/release.js';

export interface PendingReleasesContextValue {
  /** All pending (unpublished, unarchived) releases. */
  releases: Release[];
  /** Returns the pending releases that contain the given docId. */
  getReleasesForDoc: (docId: string) => Release[];
  loading: boolean;
}

const PendingReleasesContext =
  createContext<PendingReleasesContextValue | null>(null);

export function PendingReleasesProvider(props: {children?: ComponentChildren}) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchReleases() {
      try {
        const allReleases = await listReleases();
        if (cancelled) return;
        const pending = allReleases.filter(
          (r) => !r.publishedAt && !r.archivedAt
        );
        setReleases(pending);
      } catch (err) {
        console.error('Failed to fetch pending releases:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchReleases();
    return () => {
      cancelled = true;
    };
  }, []);

  function getReleasesForDoc(docId: string): Release[] {
    return releases.filter((r) => r.docIds?.includes(docId));
  }

  return (
    <PendingReleasesContext.Provider
      value={{releases, getReleasesForDoc, loading}}
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
  return context;
}
