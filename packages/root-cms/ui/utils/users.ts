import {doc, getDoc} from 'firebase/firestore';

/**
 * Returns a list of users that can edit, e.g. users with role EDITOR or ADMIN.
 */
export async function getAllEditors(): Promise<string[]> {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId || 'default';
  const docRef = doc(db, 'Projects', projectId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists) {
    return [];
  }
  const data: any = snapshot.data() || {};
  const roles: Record<string, string> = data.roles || {};
  const editors: string[] = [];
  Object.entries(roles).forEach(([email, role]) => {
    if (role === 'ADMIN' || role === 'EDITOR' || role === 'CONTRIBUTOR') {
      editors.push(email);
    }
  });
  return editors;
}
