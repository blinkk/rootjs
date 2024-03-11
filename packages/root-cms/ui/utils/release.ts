import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {cmsPublishDocs} from './doc.js';

export interface Release {
  id: string;
  description?: string;
  docIds?: string[];
  createdAt?: Timestamp;
  createdBy?: string;
  scheduledAt?: Timestamp;
  scheduledBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

const COLLECTION_ID = 'Releases';

export async function addRelease(id: string, release: Partial<Release>) {
  if (!id) {
    throw new Error('missing data source id');
  }
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await runTransaction(db, async (t) => {
    const snapshot = await t.get(docRef);
    if (snapshot.exists()) {
      throw new Error(`release exists: ${id}`);
    }
    await t.set(docRef, {
      ...release,
      id: id,
      createdAt: serverTimestamp(),
      createdBy: window.firebase.user.email,
    });
  });
}

export async function listReleases(): Promise<Release[]> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const colRef = collection(db, 'Projects', projectId, COLLECTION_ID);
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  const res: Release[] = [];
  querySnapshot.forEach((doc) => {
    res.push(doc.data() as Release);
  });
  return res;
}

export async function getRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as Release;
}

export async function updateRelease(id: string, dataSource: Partial<Release>) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await updateDoc(docRef, dataSource);
}

export async function deleteRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await deleteDoc(docRef);
  console.log(`deleted release ${id}`);
}

export async function publishRelease(id: string) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }
  const docIds = release.docIds || [];
  if (docIds.length === 0) {
    throw new Error(`no docs to publish for release: ${id}`);
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);

  // Create a batch request and publish docs and update the release in an
  // atomic write to firestore.
  const batch = writeBatch(db);
  // Update the release's publishedAt.
  batch.update(docRef, {
    publishedAt: serverTimestamp(),
    publishedBy: window.firebase.user.email,
    scheduledAt: deleteField(),
    scheduledBy: deleteField(),
  });
  await cmsPublishDocs(docIds, {batch});
  console.log(`published release: ${id}`);
}

export async function scheduleRelease(
  id: string,
  timestamp: Timestamp | number
) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }

  if (typeof timestamp === 'number') {
    timestamp = Timestamp.fromMillis(timestamp);
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);

  await updateDoc(docRef, {
    scheduledAt: timestamp,
    scheduledBy: window.firebase.user.email,
  });
}

export async function cancelScheduledRelease(id: string) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);

  await updateDoc(docRef, {
    scheduledAt: deleteField(),
    scheduledBy: deleteField(),
  });
}
