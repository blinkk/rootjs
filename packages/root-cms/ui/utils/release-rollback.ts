/**
 * Release rollbacks.
 *
 * When a release is published, the pre-release state of each item in the
 * release is saved as a rollback snapshot (see `shared/release-rollback.ts`).
 * Rolling back the release restores the snapshots, which reverts the
 * `Published` docs, published translations, and published data sources to
 * the state they were in before the release. Drafts are not modified (other
 * than their `sys` publishing metadata), so the release's changes remain in
 * the drafts and can be fixed and re-published.
 */

import {
  DocumentReference,
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import {
  RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION,
  ReleaseRollbackItemType,
  ReleaseRollbackSnapshot,
  getReleaseRollbackSnapshotKey,
  resolveReleaseRollbackPrevious,
  testTimestampsEqual,
} from '../../shared/release-rollback.js';
import {MultiBatch} from './batch.js';
import {
  CMSDoc,
  getDraftDocRef,
  getDraftDocs,
  getPublishedDocRef,
  getPublishedDocs,
} from './doc.js';
import {
  TranslationsLocaleDoc,
  TranslationsLocaleDocWithRef,
  getTranslationsLocaleDocRef,
  getTranslationsLocaleDocs,
  testV2TranslationsEnabled,
} from './translations-manager.js';

type Snapshot = ReleaseRollbackSnapshot<Timestamp>;

/** The current published state of an item. */
interface PublishedState {
  data: Record<string, any> | null;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

/**
 * An item published by a release that was changed by someone else after the
 * release was published. Rolling back the release overwrites those changes.
 */
export interface ReleaseRollbackConflict {
  type: ReleaseRollbackItemType;
  id: string;
  locale?: string;
  /**
   * `published` if the item has been published since the release, or
   * `unpublished` if it has been unpublished.
   */
  reason: 'published' | 'unpublished';
  publishedAt?: Timestamp;
  publishedBy?: string;
}

/** An item to restore when rolling back a release. */
export interface ReleaseRollbackItem {
  key: string;
  snapshot: Snapshot;
  /**
   * Whether the item has been deleted since the release. Deleted items (and
   * the translations of deleted docs) are skipped.
   */
  deleted: boolean;
  /** Whether the item's draft exists, i.e. its `sys` metadata is restored. */
  hasDraft: boolean;
  conflict?: ReleaseRollbackConflict;
}

export interface ReleaseRollbackPlan {
  releaseId: string;
  /**
   * The items to restore. Empty if the release wasn't published, or was
   * published before rollbacks were supported.
   */
  items: ReleaseRollbackItem[];
  /** Items whose changes since the release would be overwritten. */
  conflicts: ReleaseRollbackConflict[];
}

function getSnapshotsCollection(releaseId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  return collection(
    db,
    'Projects',
    projectId,
    'Releases',
    releaseId,
    RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION
  );
}

function getSnapshotRef(releaseId: string, key: string) {
  return doc(getSnapshotsCollection(releaseId), key);
}

function getDataSourceRef(id: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return doc(window.firebase.db, 'Projects', projectId, 'DataSources', id);
}

function getDataSourceDataRef(id: string, mode: 'draft' | 'published') {
  return doc(getDataSourceRef(id), 'Data', mode);
}

/** Lists a release's rollback snapshots, keyed by snapshot key. */
async function listSnapshots(
  releaseId: string
): Promise<Record<string, Snapshot>> {
  const res = await getDocs(getSnapshotsCollection(releaseId));
  const snapshots: Record<string, Snapshot> = {};
  res.forEach((snapshot) => {
    snapshots[snapshot.id] = snapshot.data() as Snapshot;
  });
  return snapshots;
}

/** Fetches the current published state of items, keyed by snapshot key. */
async function fetchPublishedStates(items: {
  docIds: string[];
  translationsIds: string[];
  dataSourceIds: string[];
}): Promise<Record<string, PublishedState>> {
  const [docs, translations, dataSources] = await Promise.all([
    items.docIds.length > 0
      ? getPublishedDocs(items.docIds)
      : ({} as Record<string, CMSDoc>),
    items.translationsIds.length > 0
      ? getTranslationsLocaleDocs(items.translationsIds, 'published')
      : ({} as Record<string, TranslationsLocaleDocWithRef[]>),
    Promise.all(
      items.dataSourceIds.map(async (id) => {
        const snapshot = await getDoc(getDataSourceDataRef(id, 'published'));
        return [id, snapshot.exists() ? snapshot.data() : null] as const;
      })
    ),
  ]);
  const states: Record<string, PublishedState> = {};
  for (const docId of items.docIds) {
    const data = docs[docId] || null;
    states[getReleaseRollbackSnapshotKey('doc', docId)] = {
      data,
      publishedAt: data?.sys?.publishedAt,
      publishedBy: data?.sys?.publishedBy,
    };
  }
  for (const localeDocs of Object.values(translations)) {
    for (const {data} of localeDocs) {
      const key = getReleaseRollbackSnapshotKey(
        'translations',
        data.id,
        data.locale
      );
      states[key] = {
        data,
        publishedAt: data.sys?.publishedAt,
        publishedBy: data.sys?.publishedBy,
      };
    }
  }
  for (const [id, data] of dataSources) {
    states[getReleaseRollbackSnapshotKey('dataSource', id)] = {
      data,
      publishedAt: data?.dataSource?.publishedAt,
      publishedBy: data?.dataSource?.publishedBy,
    };
  }
  return states;
}

/**
 * Records the pre-release state of the items a release publishes. Each
 * snapshot is written to the same batch as the item's publish, so the caller
 * must reserve batch capacity for it alongside the item's other writes.
 *
 * Usage:
 *
 * ```
 * const recorder = await ReleaseRollbackRecorder.load(releaseId, {docIds});
 * await cmsPublishDocs(docIds, {batch, rollbackRecorder: recorder});
 * ```
 */
export class ReleaseRollbackRecorder {
  private readonly releaseId: string;
  private readonly existing: Record<string, Snapshot>;
  private readonly current: Record<string, PublishedState>;

  private constructor(
    releaseId: string,
    existing: Record<string, Snapshot>,
    current: Record<string, PublishedState>
  ) {
    this.releaseId = releaseId;
    this.existing = existing;
    this.current = current;
  }

  /**
   * Fetches the current published state of the items in a release, along
   * with any existing snapshots from a previous publish of the release.
   */
  static async load(
    releaseId: string,
    items: {docIds?: string[]; dataSourceIds?: string[]}
  ): Promise<ReleaseRollbackRecorder> {
    const docIds = items.docIds || [];
    const [existing, current] = await Promise.all([
      listSnapshots(releaseId),
      fetchPublishedStates({
        docIds,
        translationsIds: testV2TranslationsEnabled() ? docIds : [],
        dataSourceIds: items.dataSourceIds || [],
      }),
    ]);
    return new ReleaseRollbackRecorder(releaseId, existing, current);
  }

  /**
   * Adds a doc's snapshot write to the batch. The doc's `Published` write
   * must be in the same underlying batch, since both use the batch's server
   * timestamp.
   */
  recordDoc(batch: MultiBatch, docId: string) {
    this.record(batch, 'doc', docId, serverTimestamp());
  }

  /**
   * Adds a translations locale doc's snapshot write to the batch.
   * `publishedAt` must be the timestamp written to the published locale doc.
   */
  recordTranslations(
    batch: MultiBatch,
    localeDoc: TranslationsLocaleDoc,
    publishedAt: Timestamp
  ) {
    this.record(
      batch,
      'translations',
      localeDoc.id,
      publishedAt,
      localeDoc.locale
    );
  }

  /**
   * Adds a data source's snapshot write to the batch. The data source's
   * `Data/published` write must be in the same underlying batch.
   */
  recordDataSource(batch: MultiBatch, id: string) {
    this.record(batch, 'dataSource', id, serverTimestamp());
  }

  private record(
    batch: MultiBatch,
    type: ReleaseRollbackItemType,
    id: string,
    releasedAt: unknown,
    locale?: string
  ) {
    const key = getReleaseRollbackSnapshotKey(type, id, locale);
    const previous = resolveReleaseRollbackPrevious(
      this.existing[key],
      this.current[key] || {data: null}
    );
    const snapshot: Record<string, unknown> = {type, id, releasedAt, previous};
    if (locale) {
      snapshot.locale = locale;
    }
    batch.set(getSnapshotRef(this.releaseId, key), snapshot);
  }
}

/**
 * Loads the items to restore when rolling back a release, and checks which of
 * them have been changed since the release was published.
 */
export async function getReleaseRollbackPlan(
  releaseId: string
): Promise<ReleaseRollbackPlan> {
  const snapshots = await listSnapshots(releaseId);
  const entries = Object.entries(snapshots);
  const idsOfType = (type: ReleaseRollbackItemType) =>
    Array.from(
      new Set(entries.filter(([, s]) => s.type === type).map(([, s]) => s.id))
    );
  const docIds = idsOfType('doc');
  const translationsIds = idsOfType('translations');
  const dataSourceIds = idsOfType('dataSource');

  const [current, draftDocs, draftTranslations, dataSourcesExist] =
    await Promise.all([
      fetchPublishedStates({docIds, translationsIds, dataSourceIds}),
      docIds.length > 0 ? getDraftDocs(docIds) : ({} as Record<string, CMSDoc>),
      translationsIds.length > 0
        ? getTranslationsLocaleDocs(translationsIds, 'draft')
        : ({} as Record<string, TranslationsLocaleDocWithRef[]>),
      Promise.all(
        dataSourceIds.map(async (id) => {
          const snapshot = await getDoc(getDataSourceRef(id));
          return [id, snapshot.exists()] as const;
        })
      ),
    ]);
  const draftTranslationsKeys = new Set<string>();
  for (const localeDocs of Object.values(draftTranslations)) {
    for (const {data} of localeDocs) {
      draftTranslationsKeys.add(
        getReleaseRollbackSnapshotKey('translations', data.id, data.locale)
      );
    }
  }
  const existingDataSources = new Set(
    dataSourcesExist.filter(([, exists]) => exists).map(([id]) => id)
  );

  const items: ReleaseRollbackItem[] = [];
  const conflicts: ReleaseRollbackConflict[] = [];
  for (const [key, snapshot] of entries) {
    let deleted: boolean;
    let hasDraft: boolean;
    if (snapshot.type === 'doc') {
      hasDraft = Boolean(draftDocs[snapshot.id]);
      deleted = !hasDraft;
    } else if (snapshot.type === 'translations') {
      hasDraft = draftTranslationsKeys.has(key);
      // Translations are published with their doc, so skip the translations
      // of deleted docs.
      const docKey = getReleaseRollbackSnapshotKey('doc', snapshot.id);
      deleted = Boolean(snapshots[docKey]) && !draftDocs[snapshot.id];
    } else {
      hasDraft = existingDataSources.has(snapshot.id);
      deleted = !hasDraft;
    }

    const item: ReleaseRollbackItem = {key, snapshot, deleted, hasDraft};
    const state = current[key];
    if (
      !deleted &&
      !testTimestampsEqual(state?.publishedAt, snapshot.releasedAt)
    ) {
      item.conflict = {
        type: snapshot.type,
        id: snapshot.id,
        reason: state?.data ? 'published' : 'unpublished',
      };
      if (snapshot.locale) {
        item.conflict.locale = snapshot.locale;
      }
      if (state?.publishedAt) {
        item.conflict.publishedAt = state.publishedAt;
      }
      if (state?.publishedBy) {
        item.conflict.publishedBy = state.publishedBy;
      }
      conflicts.push(item.conflict);
    }
    items.push(item);
  }
  return {releaseId, items, conflicts};
}

/**
 * Adds the writes that restore every item in a rollback plan to a batch. Each
 * item's snapshot is deleted along with its restore, so a partially failed
 * rollback can be retried.
 */
export function addReleaseRollbackOpsToBatch(
  batch: MultiBatch,
  plan: ReleaseRollbackPlan
) {
  const translationsByDocId: Record<string, ReleaseRollbackItem[]> = {};
  plan.items.forEach((item) => {
    if (item.snapshot.type === 'translations') {
      translationsByDocId[item.snapshot.id] ??= [];
      translationsByDocId[item.snapshot.id].push(item);
    }
  });

  const restore = (item: ReleaseRollbackItem) => {
    if (!item.deleted) {
      restoreItem(batch, item);
    }
    batch.delete(getSnapshotRef(plan.releaseId, item.key));
  };

  plan.items.forEach((item) => {
    if (item.snapshot.type === 'doc') {
      // Restore a doc and its translations in the same underlying batch.
      const translations = translationsByDocId[item.snapshot.id] || [];
      delete translationsByDocId[item.snapshot.id];
      batch.ensureCapacity(3 + 3 * translations.length);
      restore(item);
      translations.forEach(restore);
    } else if (item.snapshot.type === 'dataSource') {
      batch.ensureCapacity(4);
      restore(item);
    }
  });
  // Restore translations whose doc snapshot was already restored (e.g. by a
  // previous, partially failed rollback).
  Object.values(translationsByDocId).forEach((translations) => {
    batch.ensureCapacity(3 * translations.length);
    translations.forEach(restore);
  });
}

function restoreItem(batch: MultiBatch, item: ReleaseRollbackItem) {
  const {type, id, locale, previous} = item.snapshot;
  const user = window.firebase.user.email;
  if (type === 'doc') {
    setOrDelete(batch, getPublishedDocRef(id), previous);
    if (item.hasDraft) {
      const sys = previous?.sys || {};
      batch.update(getDraftDocRef(id), {
        'sys.modifiedAt': serverTimestamp(),
        'sys.modifiedBy': user,
        'sys.publishedAt': sys.publishedAt ?? deleteField(),
        'sys.publishedBy': sys.publishedBy ?? deleteField(),
        'sys.firstPublishedAt': sys.firstPublishedAt ?? deleteField(),
        'sys.firstPublishedBy': sys.firstPublishedBy ?? deleteField(),
      });
    }
  } else if (type === 'translations') {
    const publishedRef = getTranslationsLocaleDocRef('published', id, locale!);
    setOrDelete(batch, publishedRef, previous);
    if (item.hasDraft) {
      const sys = previous?.sys || {};
      batch.update(getTranslationsLocaleDocRef('draft', id, locale!), {
        'sys.publishedAt': sys.publishedAt ?? deleteField(),
        'sys.publishedBy': sys.publishedBy ?? deleteField(),
      });
    }
  } else {
    setOrDelete(batch, getDataSourceDataRef(id, 'published'), previous);
    const dataSource = previous?.dataSource || {};
    batch.update(getDataSourceRef(id), {
      publishedAt: dataSource.publishedAt ?? deleteField(),
      publishedBy: dataSource.publishedBy ?? deleteField(),
    });
  }
}

function setOrDelete(
  batch: MultiBatch,
  ref: DocumentReference,
  data: Record<string, any> | null
) {
  if (data) {
    batch.set(ref, data);
  } else {
    batch.delete(ref);
  }
}
