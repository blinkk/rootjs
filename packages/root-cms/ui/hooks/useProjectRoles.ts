import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {UserRole} from '../../core/client.js';

/** Module-level cache so the Firestore fetch happens at most once. */
let cachedRolesPromise: Promise<Record<string, UserRole>> | null = null;

function fetchRoles(): Promise<Record<string, UserRole>> {
  if (!cachedRolesPromise) {
    cachedRolesPromise = (async () => {
      const db = window.firebase.db;
      const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
      const docRef = doc(db, 'Projects', projectId);
      const snapshot = await getDoc(docRef);
      const data = snapshot.data() || {};
      return (data.roles || {}) as Record<string, UserRole>;
    })();
  }
  return cachedRolesPromise;
}

/**
 * React hook to fetch the roles defined for the current project.
 *
 * The roles are fetched from Firestore once and lazily cached for the lifetime
 * of the app. Subsequent calls across any component share the cached result.
 */
export function useProjectRoles() {
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoles().then((roles) => {
      setRoles(roles);
      setLoading(false);
    });
  }, []);

  return {roles, loading};
}
