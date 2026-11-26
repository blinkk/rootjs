import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {UserRole} from '../../../core/client.js';
import {withTimeout} from '../../utils/with-timeout.js';

/** Module-level cache so the Firestore fetch happens at most once. */
let cachedRolesPromise: Promise<Record<string, UserRole>> | null = null;
/** Synchronously readable once resolved so later mounts skip an extra render. */
let cachedRoles: Record<string, UserRole> | null = null;

/**
 * Fetches the roles defined for the current project, sharing the same cached
 * result as the `useProjectRoles()` hook. Exported for non-component callers
 * (e.g. the Root AI tool handlers) that need to check permissions.
 */
export function fetchProjectRoles(): Promise<Record<string, UserRole>> {
  if (!cachedRolesPromise) {
    cachedRolesPromise = (async () => {
      const db = window.firebase.db;
      const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
      const docRef = doc(db, 'Projects', projectId);
      const snapshot = await withTimeout(
        getDoc(docRef),
        undefined,
        'loading project roles'
      );
      const data = snapshot.data() || {};
      const roles = (data.roles || {}) as Record<string, UserRole>;
      cachedRoles = roles;
      return roles;
    })();
    // Don't cache failures; the next caller retries the fetch.
    cachedRolesPromise.catch(() => {
      cachedRolesPromise = null;
    });
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
  const [roles, setRoles] = useState<Record<string, UserRole>>(
    () => cachedRoles ?? {}
  );
  const [loading, setLoading] = useState(() => cachedRoles === null);

  useEffect(() => {
    if (cachedRoles !== null) {
      return;
    }
    let cancelled = false;
    fetchProjectRoles()
      .then((resolvedRoles) => {
        if (!cancelled) {
          setRoles(resolvedRoles);
        }
      })
      .catch((err) => {
        console.error('failed to load project roles:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {roles, loading};
}
