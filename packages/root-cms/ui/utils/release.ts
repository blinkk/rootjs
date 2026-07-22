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
} from 'firebase/firestore';
import {renderAutoSlug} from '../../shared/auto-slug.js';
import {logAction} from './actions.js';
import {MultiBatch} from './batch.js';
import {cmsPublishDataSources} from './data-source.js';
import {cmsPublishDocs, cmsSyncDependencyGraph} from './doc.js';

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

  // Create a batch request that publishes the release's docs and data sources
  // and updates the release. `MultiBatch` automatically splits the writes
  // across multiple batch requests as needed to stay within firestore's
  // per-batch write limits, so there is no limit on the number of docs in a
  // release.
  const batch = new MultiBatch(db);
  if (dataSourceIds.length > 0) {
    await cmsPublishDataSources(dataSourceIds, {batch, commitBatch: false});
  }
  await cmsPublishDocs(docIds, {
    batch,
    releaseId: id,
    publishMessage: release.description,
  });
  // Update the release's publishedAt. This write is intentionally added last
  // so that if any of the previous batches fails to commit, the release is
  // not marked as published and publishing can be retried.
  batch.update(docRef, {
    publishedAt: serverTimestamp(),
    publishedBy: window.firebase.user.email,
    scheduledAt: deleteField(),
    scheduledBy: deleteField(),
  });
  await batch.commit();
  console.log(`published release: ${id}`);
  // Update the dependency graph for the released docs (cmsPublishDocs skips
  // the sync when writing to a shared batch, since the batch commits here).
  await cmsSyncDependencyGraph(docIds);
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

/** Generates a release ID like `20260318-golden-meadow`. */
export function generateReleaseId(): string {
  return renderAutoSlug('{date}-{adjective}-{noun}');
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
