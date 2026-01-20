import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useState} from 'preact/hooks';
import {UserRole} from '../../core/client.js';

/**
 * React hook to fetch the roles defined for the current project.
 *
 * This hook subscribes to the project configuration in Firestore and returns
 * the mapping of email addresses (or domains) to their assigned roles.
 */
export function useProjectRoles() {
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = window.firebase.db;
    const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
    const docRef = doc(db, 'Projects', projectId);
    getDoc(docRef).then((snapshot) => {
      const data = snapshot.data() || {};
      setRoles(data.roles || {});
      setLoading(false);
    });
  }, []);

  return {roles, loading};
}
