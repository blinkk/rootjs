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
import {renderAutoSlug} from '../../../shared/auto-slug.js';
import {MultiBatch} from '../../utils/batch.js';
import {cmsPublishDataSources} from '../data-sources/data-source.js';
import {removeDocsFromCache} from '../documents/doc-cache.js';
import {cmsPublishDocs, cmsSyncDependencyGraph} from '../documents/doc.js';
import {logAction} from '../logs/actions.js';
import {type PublishChecksAuditMetadata} from './publish-checks.js';
import {
  ReleaseRollbackRecorder,
  addReleaseRollbackOpsToBatch,
  getReleaseRollbackPlan,
} from './release-rollback.js';

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
  /**
   * Set when a published release is rolled back. A rolled back release is no
   * longer published, so it can be edited and re-published.
   */
  rolledBackAt?: Timestamp;
  rolledBackBy?: string;
}

const COLLECTION_ID = 'Releases';

/** Callback notified whenever the releases cache changes. */
type ReleasesListener = (releases: Release[]) => void;

/**
 * In-memory cache of the project's releases, ordered by `createdAt` desc.
 *
 * Release state is rendered throughout the CMS (e.g. the "in release" badge in
 * the doc list), so the releases are fetched once and then kept in sync locally
 * as releases are mutated. `null` means the releases haven't been fetched yet.
 */
let releasesCache: Release[] | null = null;

/** In-flight `listReleases()` request, shared by concurrent callers. */
let pendingReleasesFetch: Promise<Release[]> | null = null;

const releasesListeners = new Set<ReleasesListener>();

/**
 * Returns the cached releases, or `null` if the releases haven't been fetched
 * yet.
 */
export function getCachedReleases(): Release[] | null {
  return releasesCache;
}

/**
 * Subscribes to changes to the releases cache. The listener is called whenever
 * a release is added, updated, or removed. Returns an unsubscribe function.
 *
 * Usage:
 *
 * ```
 * useEffect(() => subscribeToReleases(setReleases), []);
 * ```
 */
export function subscribeToReleases(listener: ReleasesListener): () => void {
  releasesListeners.add(listener);
  return () => {
    releasesListeners.delete(listener);
  };
}

/**
 * Fetches the project's releases, re-using the cached values when available.
 * Pass `{force: true}` to bypass the cache and re-fetch from the db.
 */
export function listReleasesFromCacheOrFetch(options?: {
  force?: boolean;
}): Promise<Release[]> {
  if (!options?.force && releasesCache) {
    return Promise.resolve(releasesCache);
  }
  if (!pendingReleasesFetch) {
    pendingReleasesFetch = listReleases().finally(() => {
      pendingReleasesFetch = null;
    });
  }
  return pendingReleasesFetch;
}

/** Returns true if a release is neither published nor archived. */
export function isPendingRelease(release: Release): boolean {
  return !release.publishedAt && !release.archivedAt;
}

function notifyReleasesListeners() {
  const releases = releasesCache || [];
  releasesListeners.forEach((listener) => listener(releases));
}

/** Replaces the cached releases and notifies listeners. */
function setCachedReleases(releases: Release[]) {
  releasesCache = releases;
  notifyReleasesListeners();
}

/**
 * Adds or replaces a release in the cache. New releases are prepended since the
 * cache is ordered by `createdAt` desc. No-ops if the releases haven't been
 * fetched yet, since the cache is only valid when it holds the full list.
 */
function addReleaseToCache(release: Release) {
  if (!releasesCache) {
    return;
  }
  if (releasesCache.some((r) => r.id === release.id)) {
    setCachedReleases(
      releasesCache.map((r) => (r.id === release.id ? release : r))
    );
    return;
  }
  setCachedReleases([release, ...releasesCache]);
}

/**
 * Merges field updates into a cached release. Fields set to `undefined` are
 * removed from the cached release, mirroring `deleteField()` writes.
 */
function updateReleaseInCache(id: string, updates: Partial<Release>) {
  if (!releasesCache) {
    return;
  }
  setCachedReleases(
    releasesCache.map((release) => {
      if (release.id !== id) {
        return release;
      }
      const updated: Release = {...release, ...updates};
      for (const key of Object.keys(updates)) {
        if (updates[key as keyof Release] === undefined) {
          delete (updated as Record<string, unknown>)[key];
        }
      }
      return updated;
    })
  );
}

/** Removes a release from the cache. */
function removeReleaseFromCache(id: string) {
  if (!releasesCache) {
    return;
  }
  setCachedReleases(releasesCache.filter((release) => release.id !== id));
}

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
  // Approximate the server-generated `createdAt` locally so that the release
  // shows up in the cache in the right order.
  addReleaseToCache({
    ...release,
    id: id,
    createdAt: Timestamp.now(),
    createdBy: window.firebase.user.email,
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
  setCachedReleases(res);
  return res;
}

export async function getRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    removeReleaseFromCache(id);
    return null;
  }
  const release = snapshot.data() as Release;
  addReleaseToCache(release);
  return release;
}

export async function updateRelease(id: string, release: Partial<Release>) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await updateDoc(docRef, release);
  updateReleaseInCache(id, release);
  logAction('release.save', {metadata: {releaseId: id}});
}

export async function deleteRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  await deleteDoc(docRef);
  removeReleaseFromCache(id);
  console.log(`deleted release ${id}`);
  logAction('release.delete', {metadata: {releaseId: id}});
}

export async function archiveRelease(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  // Archived releases can't be published, so archiving also cancels any
  // pending scheduled publish.
  await updateDoc(docRef, {
    archivedAt: serverTimestamp(),
    archivedBy: window.firebase.user.email,
    scheduledAt: deleteField(),
    scheduledBy: deleteField(),
  });
  updateReleaseInCache(id, {
    archivedAt: Timestamp.now(),
    archivedBy: window.firebase.user.email,
    scheduledAt: undefined,
    scheduledBy: undefined,
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
  updateReleaseInCache(id, {archivedAt: undefined, archivedBy: undefined});
  logAction('release.unarchive', {metadata: {releaseId: id}});
}

export async function publishRelease(
  id: string,
  options?: {checksAudit?: PublishChecksAuditMetadata}
) {
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

  // Fetch the current published state of the release's items, which is saved
  // alongside each item's publish so the release can be rolled back.
  const rollbackRecorder = await ReleaseRollbackRecorder.load(id, {
    docIds,
    dataSourceIds,
  });

  // Create a batch request that publishes the release's docs and data sources
  // and updates the release. `MultiBatch` automatically splits the writes
  // across multiple batch requests as needed to stay within firestore's
  // per-batch write limits, so there is no limit on the number of docs in a
  // release.
  const batch = new MultiBatch(db);
  if (dataSourceIds.length > 0) {
    await cmsPublishDataSources(dataSourceIds, {
      batch,
      commitBatch: false,
      rollbackRecorder,
    });
  }
  await cmsPublishDocs(docIds, {
    batch,
    releaseId: id,
    publishMessage: release.description,
    checksAudit: options?.checksAudit,
    rollbackRecorder,
  });
  // Update the release's publishedAt. This write is intentionally added last
  // so that if any of the previous batches fails to commit, the release is
  // not marked as published and publishing can be retried.
  batch.update(docRef, {
    publishedAt: serverTimestamp(),
    publishedBy: window.firebase.user.email,
    scheduledAt: deleteField(),
    scheduledBy: deleteField(),
    rolledBackAt: deleteField(),
    rolledBackBy: deleteField(),
  });
  await batch.commit();
  updateReleaseInCache(id, {
    publishedAt: Timestamp.now(),
    publishedBy: window.firebase.user.email,
    scheduledAt: undefined,
    scheduledBy: undefined,
    rolledBackAt: undefined,
    rolledBackBy: undefined,
  });
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
  if (options?.checksAudit) {
    metadata.checks = options.checksAudit;
  }
  logAction('release.publish', {
    metadata,
  });
}

/**
 * Rolls back a published release, restoring each doc, translation and data
 * source in the release to its published state from before the release was
 * published. Drafts keep the release's changes.
 *
 * If any item has been published or unpublished by someone else since the
 * release, rolling back would overwrite that change, so an error is thrown
 * unless `force` is set. Use `getReleaseRollbackPlan()` to list those items.
 */
export async function rollbackRelease(id: string, options?: {force?: boolean}) {
  const release = await getRelease(id);
  if (!release) {
    throw new Error(`release not found: ${id}`);
  }
  if (!release.publishedAt) {
    throw new Error(`release is not published: ${id}`);
  }
  const plan = await getReleaseRollbackPlan(id);
  if (plan.items.length === 0) {
    throw new Error(
      `no rollback data for release: ${id} (releases published before rollbacks were supported cannot be rolled back)`
    );
  }
  if (plan.conflicts.length > 0 && !options?.force) {
    throw new Error(
      `cannot rollback release ${id}: ${plan.conflicts.length} item(s) changed since the release was published`
    );
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, COLLECTION_ID, id);
  const batch = new MultiBatch(db);
  addReleaseRollbackOpsToBatch(batch, plan);
  // Added last so the release stays published (and the rollback can be
  // retried) if any of the previous batches fails to commit.
  batch.update(docRef, {
    publishedAt: deleteField(),
    publishedBy: deleteField(),
    rolledBackAt: serverTimestamp(),
    rolledBackBy: window.firebase.user.email,
  });
  await batch.commit();
  updateReleaseInCache(id, {
    publishedAt: undefined,
    publishedBy: undefined,
    rolledBackAt: Timestamp.now(),
    rolledBackBy: window.firebase.user.email,
  });
  console.log(`rolled back release: ${id}`);

  const restoredIds = (type: string) =>
    plan.items
      .filter((item) => item.snapshot.type === type && !item.deleted)
      .map((item) => item.snapshot.id);
  const docIds = restoredIds('doc');
  removeDocsFromCache(docIds);
  await cmsSyncDependencyGraph(docIds);
  const metadata: Record<string, unknown> = {
    releaseId: id,
    docIds,
    dataSourceIds: restoredIds('dataSource'),
  };
  if (plan.conflicts.length > 0) {
    metadata.overwritten = plan.conflicts.map((conflict) =>
      conflict.locale ? `${conflict.id}:${conflict.locale}` : conflict.id
    );
  }
  logAction('release.rollback', {metadata});
}

export async function scheduleRelease(
  id: string,
  timestamp: Timestamp | number,
  options?: {checksAudit?: PublishChecksAuditMetadata}
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
  updateReleaseInCache(id, {
    scheduledAt: timestamp,
    scheduledBy: window.firebase.user.email,
  });
  const metadata: Record<string, unknown> = {
    releaseId: id,
    scheduledAt: timestamp.toMillis(),
  };
  if (options?.checksAudit) {
    metadata.checks = options.checksAudit;
  }
  logAction('release.schedule', {metadata});
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
  updateReleaseInCache(id, {scheduledAt: undefined, scheduledBy: undefined});
  logAction('release.unschedule', {metadata: {releaseId: id}});
}
