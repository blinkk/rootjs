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
import {logAction} from './actions.js';
import {cmsPublishDataSources} from './data-source.js';
import {cmsPublishDocs} from './doc.js';

export interface Release {
  id: string;
  description?: string;
  docIds?: string[];
  dataSourceIds?: string[];
  createdAt?: Timestamp;
  createdBy?: string;
  scheduledAt?: Timestamp;
  scheduledBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
  archivedAt?: Timestamp;
  archivedBy?: string;
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
  logAction('release.create', {metadata: {releaseId: id}});
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
  logAction('release.save', {metadata: {releaseId: id}});
}

export async function deleteRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await deleteDoc(docRef);
  console.log(`deleted release ${id}`);
  logAction('release.delete', {metadata: {releaseId: id}});
}

export async function archiveRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await updateDoc(docRef, {
    archivedAt: serverTimestamp(),
    archivedBy: window.firebase.user.email,
  });
  logAction('release.archive', {metadata: {releaseId: id}});
}

export async function unarchiveRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await updateDoc(docRef, {
    archivedAt: deleteField(),
    archivedBy: deleteField(),
  });
  logAction('release.unarchive', {metadata: {releaseId: id}});
}

export async function publishRelease(id: string) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }
  if (release.archivedAt) {
    throw new Error(`release is archived: ${id}`);
  }
  const docIds = release.docIds || [];
  const dataSourceIds = release.dataSourceIds || [];
  if (docIds.length === 0 && dataSourceIds.length === 0) {
    throw new Error(`no docs or data sources to publish for release: ${id}`);
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
  if (dataSourceIds.length > 0) {
    await cmsPublishDataSources(dataSourceIds, {batch, commitBatch: false});
  }
  await cmsPublishDocs(docIds, {
    batch,
    releaseId: id,
    publishMessage: release.description,
  });
  console.log(`published release: ${id}`);
  const metadata: Record<string, unknown> = {
    releaseId: id,
    docIds,
    dataSourceIds,
  };
  if (release.description) {
    metadata.publishMessage = release.description;
  }
  logAction('release.publish', {
    metadata,
  });
}

export async function scheduleRelease(
  id: string,
  timestamp: Timestamp | number
) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }

  if (release.archivedAt) {
    throw new Error(`release is archived: ${id}`);
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
  logAction('release.publish', {
    metadata: {releaseId: id, scheduledAt: timestamp.toMillis()},
  });
}

const ADJECTIVES = [
  'blue',
  'bold',
  'bright',
  'calm',
  'cool',
  'cosmic',
  'crisp',
  'dark',
  'eager',
  'fast',
  'fresh',
  'gentle',
  'golden',
  'grand',
  'happy',
  'idle',
  'jolly',
  'keen',
  'lively',
  'lucky',
  'mellow',
  'mighty',
  'neat',
  'noble',
  'proud',
  'quiet',
  'rapid',
  'sharp',
  'silver',
  'swift',
  'vivid',
  'warm',
  'wild',
];

const NOUNS = [
  'arrow',
  'beacon',
  'breeze',
  'canyon',
  'cedar',
  'comet',
  'coral',
  'crane',
  'dune',
  'eagle',
  'ember',
  'falcon',
  'flame',
  'flint',
  'forest',
  'fox',
  'glacier',
  'harbor',
  'hawk',
  'lantern',
  'maple',
  'meadow',
  'orbit',
  'otter',
  'peak',
  'pine',
  'reef',
  'river',
  'sage',
  'spark',
  'spruce',
  'stone',
  'summit',
  'tide',
  'wolf',
];

/** Generates a release ID like `20260318-golden-meadow`. */
export function generateReleaseId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${y}${m}${d}-${adj}-${noun}`;
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
  logAction('release.unschedule', {metadata: {releaseId: id}});
}
