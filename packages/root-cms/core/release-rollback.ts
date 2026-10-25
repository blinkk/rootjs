import {FieldValue, Timestamp, WriteBatch} from 'firebase-admin/firestore';
import {
  RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION,
  ReleaseRollbackItemType,
  ReleaseRollbackSnapshot,
  getReleaseRollbackSnapshotKey,
  resolveReleaseRollbackPrevious,
} from '../shared/release-rollback.js';
import type {RootCMSClient} from './client.js';
import type {
  TranslationsLocaleDoc,
  TranslationsLocaleDocWithRef,
} from './translations-manager.js';

type Snapshot = ReleaseRollbackSnapshot<Timestamp>;

interface PublishedState {
  data: Record<string, any> | null;
  publishedAt?: Timestamp;
}

/**
 * Records the pre-release state of the items a release publishes, so that the
 * release can be rolled back from the CMS UI. Server-side counterpart of
 * `ReleaseRollbackRecorder` in `ui/utils/release-rollback.ts` (used when
 * scheduled releases are published). See `shared/release-rollback.ts`.
 *
 * Each snapshot must be written to the same batch as the item's publish.
 */
export class ReleaseRollbackRecorder {
  private readonly cmsClient: RootCMSClient;
  private readonly releaseId: string;
  private readonly existing: Record<string, Snapshot>;
  private readonly current: Record<string, PublishedState>;

  private constructor(
    cmsClient: RootCMSClient,
    releaseId: string,
    existing: Record<string, Snapshot>,
    current: Record<string, PublishedState>
  ) {
    this.cmsClient = cmsClient;
    this.releaseId = releaseId;
    this.existing = existing;
    this.current = current;
  }

  /**
   * Fetches the current published state of the items in a release, along
   * with any existing snapshots from a previous publish of the release.
   */
  static async load(
    cmsClient: RootCMSClient,
    releaseId: string,
    items: {docIds?: string[]; dataSourceIds?: string[]}
  ): Promise<ReleaseRollbackRecorder> {
    const db = cmsClient.db;
    const projectId = cmsClient.projectId;
    const docIds = items.docIds || [];
    const dataSourceIds = items.dataSourceIds || [];
    const snapshotsPath = `${cmsClient.dbReleasePath(releaseId)}/${RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION}`;
    const [existingSnapshot, docs, translations, dataSources] =
      await Promise.all([
        db.collection(snapshotsPath).get(),
        docIds.length > 0
          ? db.getAll(
              ...docIds.map((docId) => {
                const [collection, slug] = docId.split('/');
                return db.doc(
                  `Projects/${projectId}/Collections/${collection}/Published/${slug}`
                );
              })
            )
          : [],
        docIds.length > 0 && cmsClient.isV2TranslationsEnabled()
          ? cmsClient
              .getTranslationsManager()
              .getTranslationsLocaleDocs(docIds, 'published')
          : ({} as Record<string, TranslationsLocaleDocWithRef[]>),
        dataSourceIds.length > 0
          ? db.getAll(
              ...dataSourceIds.map((id) =>
                cmsClient.dbDataSourceDataRef(id, {mode: 'published'})
              )
            )
          : [],
      ]);

    const existing: Record<string, Snapshot> = {};
    existingSnapshot.docs.forEach((doc) => {
      existing[doc.id] = doc.data() as Snapshot;
    });
    const current: Record<string, PublishedState> = {};
    docs.forEach((doc, i) => {
      const data = doc.exists ? doc.data()! : null;
      current[getReleaseRollbackSnapshotKey('doc', docIds[i])] = {
        data,
        publishedAt: data?.sys?.publishedAt,
      };
    });
    Object.values(translations).forEach((localeDocs) => {
      localeDocs.forEach(({data}) => {
        const key = getReleaseRollbackSnapshotKey(
          'translations',
          data.id,
          data.locale
        );
        current[key] = {data, publishedAt: data.sys?.publishedAt};
      });
    });
    dataSources.forEach((doc, i) => {
      const data = doc.exists ? doc.data()! : null;
      current[getReleaseRollbackSnapshotKey('dataSource', dataSourceIds[i])] = {
        data,
        publishedAt: data?.dataSource?.publishedAt,
      };
    });
    return new ReleaseRollbackRecorder(cmsClient, releaseId, existing, current);
  }

  /**
   * Adds a doc's snapshot write to the batch. Returns the number of writes
   * added.
   */
  recordDoc(batch: WriteBatch, docId: string): number {
    return this.record(batch, 'doc', docId, FieldValue.serverTimestamp());
  }

  /**
   * Adds a translations locale doc's snapshot write to the batch.
   * `publishedAt` must be the timestamp written to the published locale doc.
   * Returns the number of writes added.
   */
  recordTranslations(
    batch: WriteBatch,
    localeDoc: TranslationsLocaleDoc,
    publishedAt: Timestamp
  ): number {
    return this.record(
      batch,
      'translations',
      localeDoc.id,
      publishedAt,
      localeDoc.locale
    );
  }

  /**
   * Adds a data source's snapshot write to the batch. Returns the number of
   * writes added.
   */
  recordDataSource(batch: WriteBatch, id: string): number {
    return this.record(batch, 'dataSource', id, FieldValue.serverTimestamp());
  }

  private record(
    batch: WriteBatch,
    type: ReleaseRollbackItemType,
    id: string,
    releasedAt: Timestamp | FieldValue,
    locale?: string
  ): number {
    const key = getReleaseRollbackSnapshotKey(type, id, locale);
    const previous = resolveReleaseRollbackPrevious(
      this.existing[key],
      this.current[key] || {data: null}
    );
    const snapshot: Record<string, unknown> = {type, id, releasedAt, previous};
    if (locale) {
      snapshot.locale = locale;
    }
    const ref = this.cmsClient.db.doc(
      `${this.cmsClient.dbReleasePath(this.releaseId)}/${RELEASE_ROLLBACK_SNAPSHOTS_COLLECTION}/${key}`
    );
    batch.set(ref, snapshot);
    return 1;
  }
}
