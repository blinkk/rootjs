import {
  DocumentReference,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {logAction} from './actions.js';
import {CMSDoc, getDraftDocRef, getPublishedDocRef} from './docs.js';

export type VersionDoc = CMSDoc & {
  _versionId: string;
};

export async function dbListVersions(docId: string) {
  const db = window.firebase.db;
  const docRef = getDraftDocRef(docId);
  const versionsCollection = collection(db, docRef.path, 'Versions');
  const q = query(versionsCollection, orderBy('sys.modifiedAt', 'desc'));
  const querySnapshot = await getDocs(q);
  const versions: VersionDoc[] = [];
  querySnapshot.forEach((doc) => {
    const version = {
      ...(doc.data() as VersionDoc),
      _versionId: doc.id,
    };
    versions.push(version);
  });
  return versions;
}

export async function dbRestoreVersion(docId: string, version: VersionDoc) {
  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': window.firebase.user.email,
    fields: version.fields || {},
  };
  await updateDoc(docRef, updates);
  logAction('doc.restore_version', {
    metadata: {
      docId,
      versionModifiedAt: version.sys?.modifiedAt,
      versionModifiedBy: version.sys?.modifiedBy,
    },
  });
}

export async function dbGetDocVersion(
  docId: string,
  versionId: string | 'draft' | 'published'
): Promise<CMSDoc | null> {
  let docRef: DocumentReference;
  if (versionId === 'draft') {
    docRef = getDraftDocRef(docId);
  } else if (versionId === 'published') {
    docRef = getPublishedDocRef(docId);
  } else {
    docRef = getVersionDocRef(docId, versionId);
  }

  const snapshot = await getDoc(docRef);
  if (snapshot.exists()) {
    return snapshot.data() as CMSDoc;
  }
  return null;
}

export function getVersionDocRef(docId: string, versionId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  return doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug,
    'Versions',
    versionId
  );
}
