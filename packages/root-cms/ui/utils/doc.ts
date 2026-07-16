import {
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  deleteField,
  writeBatch,
  arrayUnion,
  collection,
  query,
  orderBy,
  getDocs,
  updateDoc,
  documentId,
  where,
  Query,
  WriteBatch,
  DocumentReference,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import {testValidRichTextData} from '../../shared/richtext.js';
import {generateKeyAfter} from '../../shared/sort-key.js';
import {logAction} from './actions.js';
import {extractAssetIds} from './assets.js';
import {removeDocFromCache, removeDocsFromCache} from './doc-cache.js';
import {GoogleSheetId} from './gsheets.js';
import {
  getLocalesForTranslationLanguage,
  getTranslationsCollection,
  isLocaleExcludedFromTranslations,
  normalizeLocale,
  normalizeString,
  sourceHash,
} from './l10n.js';

export interface CMSDoc {
  id: string;
  collection: string;
  slug: string;
  sys: {
    createdAt: Timestamp;
    createdBy: string;
    modifiedAt: Timestamp;
    modifiedBy: string;
    scheduledAt?: Timestamp;
    scheduledBy?: string;
    firstPublishedAt?: Timestamp;
    firstPublishedBy?: string;
    publishedAt?: Timestamp;
    publishedBy?: string;
    publishingLocked?: {
      lockedAt: string;
      lockedBy: string;
      reason: string;
      until?: Timestamp;
    };
    archivedAt?: Timestamp;
    archivedBy?: string;
    /**
     * Fractional-index string defining the doc's custom order within the
     * collection. See the `customSorting` collection option.
     */
    sortKey?: string;
    locales?: string[];
    /**
     * Reverse index of asset library ids embedded in the doc's fields,
     * (re)computed on every draft save. Used to find docs that use an asset
     * and to fan out asset updates (see `ui/utils/assets.ts`).
     */
    assets?: string[];
    /** Google Sheet linked for translations. */
    l10nSheet?: {
      spreadsheetId: string;
      gid: number;
      linkedAt: Timestamp;
      linkedBy: string;
    };
  };
  fields: any;
}

export type Version = CMSDoc & {
  _versionId: string;
  tags?: string[];
  publishMessage?: string;
};

export async function cmsDeleteDoc(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
  const scheduledDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Scheduled',
    slug
  );

  const batch = writeBatch(db);
  // Delete the draft doc.
  batch.delete(draftDocRef);
  // Delete the published doc.
  batch.delete(publishedDocRef);
  // Delete any scheduled doc.
  batch.delete(scheduledDocRef);
  await batch.commit();
  console.log(`deleted doc: ${docId}`);
  logAction('doc.delete', {metadata: {docId}});
}

export async function cmsPublishDoc(
  docId: string,
  options?: {publishMessage?: string}
) {
  await cmsPublishDocs([docId], options);
}

/**
 * Batch publishes a group of docs.
 */
export async function cmsPublishDocs(
  docIds: string[],
  options?: {batch?: WriteBatch; releaseId?: string; publishMessage?: string}
) {
  if (docIds.length === 0) {
    console.log('no docs to publish');
    return;
  }

  const db = window.firebase.db;

  if (docIds.length > 100) {
    throw new Error(
      'publish docs exceeds limit of 100 docs. break up your request into multiple calls.'
    );
  }

  const draftDocs = await getDraftDocs(docIds);
  const batch = options?.batch || writeBatch(db);
  const versionTags = ['published'];
  if (options?.releaseId) {
    versionTags.push(`release:${options.releaseId}`);
  }
  docIds.forEach((docId) => {
    const draftData = draftDocs[docId];
    if (!draftData) {
      throw new Error(`doc does not exist: ${docId}`);
    }
    updatePublishedDocDataInBatch(
      batch,
      docId,
      draftData,
      versionTags,
      options?.publishMessage
    );
  });
  await batch.commit();

  if (docIds.length === 1) {
    console.log(`published ${docIds[0]}`);
  } else {
    console.log(`published ${docIds.length} docs: ${docIds.join(', ')}`);
  }

  for (const docId of docIds) {
    const metadata: Record<string, unknown> = {docId};
    if (options?.publishMessage) {
      metadata.publishMessage = options.publishMessage;
    }
    logAction('doc.publish', {metadata});
  }

  // Reset doc cache for published docs.
  removeDocsFromCache(docIds);
}

/**
 * Adds published doc writes to a batch request. This method does the following:
 * - Updates the "sys" meta data on the draft doc
 * - Removes any previously scheduled docs
 * - Copies the "draft" data to "published" data
 */
function updatePublishedDocDataInBatch(
  batch: WriteBatch,
  docId: string,
  draftData: CMSDoc,
  versionTags: string[],
  publishMessage?: string
) {
  if (testPublishingLocked(draftData)) {
    throw new Error(`publishing is locked for doc: ${draftData.id}`);
  }

  if (testIsArchived(draftData)) {
    throw new Error(`cannot publish archived doc: ${draftData.id}`);
  }

  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const scheduledDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Scheduled',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );

  const data = {...draftData};
  const sys: any = data.sys ?? {};
  sys.modifiedAt = serverTimestamp();
  sys.modifiedBy = window.firebase.user.email;
  sys.publishedAt = serverTimestamp();
  sys.publishedBy = window.firebase.user.email;
  // Update the "firstPublishedAt" values only if they don't already exist.
  sys.firstPublishedAt ??= serverTimestamp();
  sys.firstPublishedBy ??= window.firebase.user.email;
  // Remove the "scheduled" values if they exist.
  delete sys.scheduledAt;
  delete sys.scheduledBy;

  // Update the "sys" metadata in the draft doc.
  batch.update(draftDocRef, {sys});
  // Copy the "draft" data to "published" data.
  batch.set(publishedDocRef, {...data, sys});
  // Delete any "scheduled" docs if it exists.
  batch.delete(scheduledDocRef);
  // Save a version snapshot of the published doc.
  const versionRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug,
    'Versions',
    String(Date.now())
  );
  const versionData: any = {
    id: docId,
    collection: collectionId,
    slug,
    fields: data.fields || {},
    sys,
  };
  if (versionTags?.length) {
    versionData.tags = versionTags;
  }
  if (publishMessage) {
    versionData.publishMessage = publishMessage;
  }
  batch.set(versionRef, versionData);
}

/**
 * Schedules a CMS doc to be published at some time in the future.
 */
export async function cmsScheduleDoc(
  docId: string,
  millis: number,
  options?: {publishMessage?: string}
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const scheduledDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Scheduled',
    slug
  );
  await runTransaction(db, async (transaction) => {
    const draftDoc = await transaction.get(draftDocRef);
    if (!draftDoc.exists()) {
      throw new Error(`${draftDocRef.id} does not exist`);
    }

    const data = {...draftDoc.data()};
    const sys = data.sys ?? {};
    sys.modifiedAt = serverTimestamp();
    sys.modifiedBy = window.firebase.user.email;
    sys.scheduledAt = Timestamp.fromMillis(millis);
    sys.scheduledBy = window.firebase.user.email;

    // Update the "sys" metadata in the draft doc.
    transaction.update(draftDocRef, {sys});
    // Copy the "draft" data to "scheduled" data.
    const scheduledData: any = {...data, sys};
    if (options?.publishMessage) {
      scheduledData.scheduledPublishMessage = options.publishMessage;
    }
    transaction.set(scheduledDocRef, scheduledData);
  });
  console.log(`saved ${scheduledDocRef.id}`);

  const metadata: Record<string, unknown> = {docId, scheduledAt: millis};
  if (options?.publishMessage) {
    metadata.publishMessage = options.publishMessage;
  }
  logAction('doc.schedule', {metadata});
}

export async function cmsUnpublishDoc(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const scheduledDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Scheduled',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
  const batch = writeBatch(db);
  // Update the "sys" metadata in the draft doc.
  batch.update(draftDocRef, {
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': window.firebase.user.email,
    'sys.publishedAt': deleteField(),
    'sys.publishedBy': deleteField(),
    'sys.firstPublishedAt': deleteField(),
    'sys.firstPublishedBy': deleteField(),
  });
  // Delete the "scheduled" doc.
  batch.delete(scheduledDocRef);
  // Delete the "published" doc.
  batch.delete(publishedDocRef);
  await batch.commit();
  console.log(`unpublished ${docId}`);
  logAction('doc.unpublish', {metadata: {docId}});
  removeDocFromCache(docId);
}

export async function cmsRevertDraft(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const publishedDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
  await runTransaction(db, async (transaction) => {
    const publishedDoc = await transaction.get(publishedDocRef);
    if (!publishedDoc.exists()) {
      throw new Error(`${publishedDocRef.id} does not exist`);
    }
    const data = publishedDoc.data();
    transaction.set(draftDocRef, data);
  });
  console.log(`reverted draft ${docId}`);
  logAction('doc.revert', {metadata: {docId}});
}

export async function cmsUnscheduleDoc(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  const draftDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const scheduledDocRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Scheduled',
    slug
  );
  const batch = writeBatch(db);
  // Update the "sys" metadata in the draft doc.
  batch.update(draftDocRef, {
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': window.firebase.user.email,
    'sys.scheduledAt': deleteField(),
    'sys.scheduledBy': deleteField(),
  });
  // Delete the "scheduled" doc.
  batch.delete(scheduledDocRef);
  await batch.commit();
  console.log(`unscheduled ${docId}`);
  logAction('doc.unschedule', {metadata: {docId}});
}

export async function cmsLockPublishing(
  docId: string,
  options: {reason: string; until?: number}
) {
  const publishingLocked: any = {
    lockedAt: serverTimestamp(),
    lockedBy: window.firebase.user.email,
    reason: options.reason || `Locked by ${window.firebase.user.email}.`,
  };
  if (options.until) {
    publishingLocked.until = Timestamp.fromMillis(options.until);
  }

  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.publishingLocked': publishingLocked,
  };
  await updateDoc(docRef, updates);
  const metadata: any = {docId, reason: options.reason};
  if (options.until) {
    metadata.until = options.until;
  }
  logAction('doc.lock_publishing', {metadata});
}

export async function cmsUnlockPublishing(docId: string) {
  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.publishingLocked': deleteField(),
  };
  await updateDoc(docRef, updates);
  logAction('doc.unlock_publishing', {metadata: {docId}});
}

/**
 * Archives a doc. Archived docs are hidden from list views by default but are
 * otherwise left intact. Use {@link cmsUnarchiveDoc} to restore.
 */
export async function cmsArchiveDoc(docId: string) {
  const docRef = getDraftDocRef(docId);
  await updateDoc(docRef, {
    'sys.archivedAt': serverTimestamp(),
    'sys.archivedBy': window.firebase.user.email,
  });
  logAction('doc.archive', {metadata: {docId}});
}

/**
 * Unarchives a previously archived doc.
 */
export async function cmsUnarchiveDoc(docId: string) {
  const docRef = getDraftDocRef(docId);
  await updateDoc(docRef, {
    'sys.archivedAt': deleteField(),
    'sys.archivedBy': deleteField(),
  });
  logAction('doc.unarchive', {metadata: {docId}});
}

/**
 * Sets the custom sort order key for a doc (see the `customSorting`
 * collection option).
 *
 * Like any other edit, the key is written to the draft doc and
 * `sys.modifiedAt` is updated, so the doc shows as having unpublished
 * changes. The new order takes effect on live (published) listings when the
 * doc is published (publishing copies the draft `sys`, including
 * `sys.sortKey`, to the published doc).
 */
export async function cmsSetDocSortKey(docId: string, sortKey: string) {
  await updateDoc(getDraftDocRef(docId), {
    'sys.sortKey': sortKey,
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': window.firebase.user.email,
  });
  logAction('doc.reorder', {metadata: {docId, sortKey}});
}

/**
 * Batch-assigns custom sort order keys to docs (see the `customSorting`
 * collection option). Used to initialize positions for docs that don't have a
 * `sys.sortKey` yet (e.g. docs created before the option was enabled or docs
 * created by import scripts) and to renormalize keys.
 *
 * Like {@link cmsSetDocSortKey}, the keys are written to the draft docs and
 * `sys.modifiedAt` is updated — docs need to be published for the new order
 * to take effect on live listings.
 */
export async function cmsAssignSortKeys(
  entries: Array<{docId: string; sortKey: string}>
) {
  if (entries.length === 0) {
    return;
  }
  const db = window.firebase.db;
  // Update the draft docs in chunks (firestore batches are limited to 500
  // writes).
  let batch = writeBatch(db);
  let count = 0;
  for (const entry of entries) {
    batch.update(getDraftDocRef(entry.docId), {
      'sys.sortKey': entry.sortKey,
      'sys.modifiedAt': serverTimestamp(),
      'sys.modifiedBy': window.firebase.user.email,
    });
    count += 1;
    if (count >= 500) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
  const collectionId = entries[0].docId.split('/')[0];
  logAction('doc.assign_sort_keys', {
    metadata: {collectionId, count: entries.length},
  });
}

/**
 * Returns the largest `sys.sortKey` among a collection's draft docs
 * (including archived docs), or null when no doc has a sort key. Note that
 * firestore's `orderBy()` excludes docs without the field, which is exactly
 * what's needed here.
 */
export async function fetchMaxSortKey(
  collectionId: string
): Promise<string | null> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const dbCollection = collection(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts'
  );
  const q = query(dbCollection, orderBy('sys.sortKey', 'desc'), limit(1));
  const snapshot = await getDocs(q);
  return snapshot.docs[0]?.data()?.sys?.sortKey ?? null;
}

/**
 * Checks if a doc is archived.
 */
export function testIsArchived(docData: CMSDoc) {
  return Boolean(docData?.sys?.archivedAt);
}

/**
 * Checks if a doc has a pending scheduled publish.
 */
export function testIsScheduled(docData: CMSDoc) {
  const now = Timestamp.now().toMillis();
  const scheduledAt = docData?.sys?.scheduledAt?.toMillis() || 0;
  return scheduledAt > now;
}

/**
 * Checks if a doc has a publishing lock.
 */
export function testPublishingLocked(docData: CMSDoc) {
  if (docData?.sys?.publishingLocked) {
    if (docData.sys.publishingLocked.until) {
      const now = Timestamp.now().toMillis();
      const until = docData.sys.publishingLocked.until.toMillis();
      return now < until;
    }
    return true;
  }
  return false;
}

export async function cmsCopyDoc(
  fromDocId: string,
  toDocId: string,
  options?: {overwrite?: boolean}
) {
  const fromDocRef = getDraftDocRef(fromDocId);
  const fromDoc = await getDoc(fromDocRef);
  if (!fromDoc.exists()) {
    throw new Error(`doc ${fromDocId} does not exist`);
  }
  const data = fromDoc.data();
  const fields = data.fields ?? {};
  const locales = data.sys?.locales;
  await cmsCreateDoc(toDocId, {
    fields,
    locales,
    overwrite: options?.overwrite,
  });
}

export async function cmsCreateDoc(
  docId: string,
  options?: {
    fields?: Record<string, any>;
    locales?: string[];
    overwrite?: boolean;
  }
) {
  const [collectionId, slug] = docId.split('/');
  const docRef = getDraftDocRef(docId);
  const doc = await getDoc(docRef);
  if (doc.exists() && !options?.overwrite) {
    throw new Error(`${docId} already exists`);
  }
  const fields = options?.fields ?? {};
  const data = {
    id: docId,
    collection: collectionId,
    slug: slug,
    sys: {
      createdAt: serverTimestamp(),
      createdBy: window.firebase.user.email,
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
      locales: options?.locales ?? ['en'],
    } as Record<string, any>,
    fields: fields,
  };

  // Preserve "sys" values when copying and overwriting a doc.
  if (doc.exists() && options?.overwrite) {
    const oldData = doc.data();
    data.sys = {
      ...oldData.sys,
      locales: options?.locales ?? oldData.sys.locales,
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
    };
  }

  // For collections with custom sorting enabled, assign a sort key that
  // places the new doc at the end of the custom order. Overwriting an
  // already-keyed doc preserves its position (via the "sys" merge above).
  const rootCollection = window.__ROOT_CTX.collections?.[collectionId];
  if (rootCollection?.customSorting && !data.sys.sortKey) {
    try {
      data.sys.sortKey = generateKeyAfter(await fetchMaxSortKey(collectionId));
    } catch (err) {
      // A sort key failure shouldn't block doc creation; the CMS shows an
      // "assign positions" banner for keyless docs.
      console.error(`failed to assign sort key: ${docId}`, err);
    }
  }

  // Index any asset library references embedded in the fields (e.g. when
  // copying a doc) so the asset library can find docs that use an asset.
  const assetIds = extractAssetIds(fields);
  if (assetIds.length > 0) {
    data.sys.assets = assetIds;
  } else {
    delete data.sys.assets;
  }

  await setDoc(docRef, data);
  logAction('doc.create', {metadata: {docId}});
}

export interface CsvTranslation {
  [key: string]: string;
  source: string;
}

export async function cmsDocImportTranslations(
  docId: string,
  csvData: CsvTranslation[],
  options?: {
    tags?: string[];
    /** Extra metadata to include in the action log entry. */
    actionMetadata?: Record<string, unknown>;
    /** Links to include in the action log entry. */
    actionLinks?: Array<{label: string; url: string; target?: string}>;
  }
) {
  const translationsMap: Record<string, CsvTranslation> = {};
  for (const row of csvData) {
    if (!row.source) {
      continue;
    }
    const translation: CsvTranslation = {
      source: normalizeString(row.source),
    };
    // A column may be a root locale or a translation language shared by
    // multiple root locales (e.g. `es-419` covering `es_mx` and `es_co`).
    // Language columns fan out to every locale in the group,
    // but a column that names a root locale directly takes precedence.
    const fromLanguageColumns: Record<string, string> = {};
    const fromLocaleColumns: Record<string, string> = {};
    Object.entries(row).forEach(([column, str]) => {
      if (column === 'source') {
        return;
      }
      const exactLocale = normalizeLocale(column);
      for (const locale of getLocalesForTranslationLanguage(column)) {
        // Skip locales excluded from translation import/export (e.g. `ALL_*`).
        if (isLocaleExcludedFromTranslations(locale)) {
          continue;
        }
        const target =
          locale === exactLocale ? fromLocaleColumns : fromLanguageColumns;
        target[locale] = normalizeString(str || '');
      }
    });
    Object.assign(translation, fromLanguageColumns, fromLocaleColumns);

    const hash = await sourceHash(translation.source);
    translationsMap[hash] = translation;
  }

  // Tags are stored as key-value pairs so that we can call updateDoc() without
  // having to read the actual document.
  const collectionId = docId.split('/')[0];
  const tags = [collectionId, docId];
  if (options?.tags) {
    tags.push(...options.tags);
  }

  // Save each string to `Projects/<project>/Translations/<hash>` in a batch
  // request. Note: Firestore batches have limit of 500 writes.
  const translationsCollection = getTranslationsCollection();
  const db = window.firebase.db;
  let batch = writeBatch(db);
  let count = 0;
  for (const hash in translationsMap) {
    const translations = translationsMap[hash];
    const stringDocRef = doc(translationsCollection, hash);
    batch.set(
      stringDocRef,
      {
        ...translations,
        // Use arrayUnion to only add tags that don't already exist.
        tags: arrayUnion(...tags),
      },
      {merge: true}
    );
    count += 1;
    if (count >= 500) {
      await batch.commit();
      batch = writeBatch(db);
      console.log(`saved ${count} strings`);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
    console.log(`saved ${count} strings`);
  }
  logAction('doc.import_translations', {
    metadata: {docId, ...options?.actionMetadata},
    links: options?.actionLinks,
  });
  return translationsMap;
}

export function getDraftDocRef(docId: string) {
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
    slug
  );
}

export function getPublishedDocRef(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  return doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Published',
    slug
  );
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

export async function getDraftDocs(
  docIds: string[]
): Promise<Record<string, CMSDoc>> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const collectionSlugs: Record<string, string[]> = {};
  docIds.forEach((docId) => {
    const [collectionId, slug] = docId.split('/');
    if (collectionId in collectionSlugs) {
      collectionSlugs[collectionId].push(slug);
    } else {
      collectionSlugs[collectionId] = [slug];
    }
  });
  const drafts: Record<string, CMSDoc> = {};
  await Promise.all(
    Object.entries(collectionSlugs).map(async ([collectionId, slugs]) => {
      const dbCollection = collection(
        db,
        'Projects',
        projectId,
        'Collections',
        collectionId,
        'Drafts'
      );
      const q = query(dbCollection, where(documentId(), 'in', slugs));
      const res = await getDocs(q);
      res.forEach((doc) => {
        const docId = `${collectionId}/${doc.id}`;
        drafts[docId] = doc.data() as CMSDoc;
      });
    })
  );
  return drafts;
}

export interface ListVersionsResult {
  versions: Version[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export async function cmsListVersions(
  docId: string,
  options?: {tags?: string[]; limit?: number; cursor?: QueryDocumentSnapshot}
): Promise<ListVersionsResult> {
  const db = window.firebase.db;
  const docRef = getDraftDocRef(docId);
  const versionsCollection = collection(db, docRef.path, 'Versions');
  const pageSize = options?.limit ?? 50;
  let q: Query = query(
    versionsCollection,
    orderBy('sys.modifiedAt', 'desc'),
    limit(pageSize)
  );
  if (options?.tags) {
    q = query(q, where('tags', 'array-contains-any', options.tags));
  }
  if (options?.cursor) {
    q = query(q, startAfter(options.cursor));
  }
  const querySnapshot = await getDocs(q);
  const versions: Version[] = [];
  let lastDoc: QueryDocumentSnapshot | null = null;
  querySnapshot.forEach((doc) => {
    const version = {
      ...(doc.data() as Version),
      _versionId: doc.id,
    };
    versions.push(version);
    lastDoc = doc;
  });
  return {versions, lastDoc, hasMore: querySnapshot.size === pageSize};
}

export async function cmsRestoreVersion(docId: string, version: Version) {
  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.modifiedAt': serverTimestamp(),
    'sys.modifiedBy': window.firebase.user.email,
    'sys.assets': extractAssetIds(version.fields || {}),
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

/**
 * Format for time-anchored version ids (e.g. `before:1718000000000`), which
 * resolve to the version snapshot nearest to a timestamp. Used by the action
 * logs to link to a diff of the changes around the time of an action.
 */
const VERSION_TIME_ANCHOR_RE = /^(before|after):(\d+)$/;

/**
 * Tolerance (in millis) applied to time-anchored version lookups to account
 * for the delay between a version snapshot being saved and the corresponding
 * action being logged.
 */
const VERSION_TIME_ANCHOR_TOLERANCE = 10 * 1000;

export async function cmsReadDocVersion(
  docId: string,
  versionId: string | 'draft' | 'published'
): Promise<CMSDoc | null> {
  // Resolve time-anchored version ids, e.g. `before:<millis>`.
  const timeAnchor = String(versionId).match(VERSION_TIME_ANCHOR_RE);
  if (timeAnchor) {
    return await readDocVersionAtTime(
      docId,
      timeAnchor[1] as 'before' | 'after',
      parseInt(timeAnchor[2])
    );
  }

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

/**
 * Reads the doc version snapshot nearest to the given timestamp.
 *
 * - `before` returns the latest version saved before the timestamp, or null
 *   if no version exists (e.g. the doc was created around the timestamp).
 * - `after` returns the earliest version saved at or after the timestamp,
 *   falling back to the current draft if no version exists yet.
 */
async function readDocVersionAtTime(
  docId: string,
  anchor: 'before' | 'after',
  millis: number
): Promise<CMSDoc | null> {
  const db = window.firebase.db;
  const draftDocRef = getDraftDocRef(docId);
  const versionsCollection = collection(db, draftDocRef.path, 'Versions');
  const boundary = Timestamp.fromMillis(millis - VERSION_TIME_ANCHOR_TOLERANCE);
  let q: Query;
  if (anchor === 'before') {
    q = query(
      versionsCollection,
      where('sys.modifiedAt', '<', boundary),
      orderBy('sys.modifiedAt', 'desc'),
      limit(1)
    );
  } else {
    q = query(
      versionsCollection,
      where('sys.modifiedAt', '>=', boundary),
      orderBy('sys.modifiedAt', 'asc'),
      limit(1)
    );
  }
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    // If no version snapshot exists after the timestamp (e.g. the versions
    // cron job hasn't run yet), fall back to the current draft, which
    // contains the latest changes.
    if (anchor === 'after') {
      return await cmsReadDocVersion(docId, 'draft');
    }
    return null;
  }
  return querySnapshot.docs[0].data() as CMSDoc;
}

/**
 * Links a Google Sheet to a doc for localization.
 */
export async function cmsLinkGoogleSheetL10n(
  docId: string,
  sheetId: GoogleSheetId
) {
  if (!sheetId?.spreadsheetId) {
    throw new Error('no spreadsheet id');
  }
  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.l10nSheet': {
      spreadsheetId: sheetId.spreadsheetId,
      gid: sheetId.gid || 0,
      linkedAt: serverTimestamp(),
      linkedBy: window.firebase.user.email,
    },
  };
  await updateDoc(docRef, updates);
  logAction('doc.link_sheet', {metadata: {docId: docId, sheetId: sheetId}});
}

/**
 * Unlinks a Google Sheet used for localization.
 */
export async function cmsUnlinkGoogleSheetL10n(docId: string) {
  const docRef = getDraftDocRef(docId);
  const updates = {
    'sys.l10nSheet': deleteField(),
  };
  await updateDoc(docRef, updates);
  logAction('doc.unlink_sheet', {metadata: {docId}});
}

/**
 * Returns the linked localization Google Sheet for a doc.
 */
export async function cmsGetLinkedGoogleSheetL10n(
  docId: string
): Promise<GoogleSheetId | null> {
  const docRef = getDraftDocRef(docId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.data();
  const l10nSheet = data?.sys?.l10nSheet || {};
  if (l10nSheet?.spreadsheetId) {
    return {
      spreadsheetId: l10nSheet.spreadsheetId,
      gid: l10nSheet.gid || 0,
    };
  }
  return null;
}

export interface ArrayObject {
  [key: string]: any;
  _array: string[];
}

/**
 * Walks the data tree and converts any Timestamp objects to millis and any
 * _array maps to normal arrays.
 *
 * E.g.:
 *
 * normalizeData({
 *   sys: {modifiedAt: Timestamp(123)},
 *   fields: {
 *     _array: ['asdf'],
 *     asdf: {title: 'hello'}
 *   }
 * })
 * // => {sys: {modifiedAt: 123}, fields: {foo: [{title: 'hello'}]}}
 */
export function unmarshalData(
  data: any,
  options?: {removeArrayKey: boolean}
): any {
  const result: any = {};
  for (const key in data) {
    const val = data[key];
    if (isObject(val)) {
      if (val.toMillis) {
        result[key] = val.toMillis();
      } else if (Object.hasOwn(val, '_array') && Array.isArray(val._array)) {
        const arr = val._array.map((arrayKey: string) => {
          const obj = {
            ...unmarshalData(val[arrayKey] || {}, options),
            _arrayKey: arrayKey,
          };
          if (options?.removeArrayKey) {
            delete obj._arrayKey;
          }
          return obj;
        });
        result[key] = arr;
      } else {
        result[key] = unmarshalData(val, options);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Serializes an array into an `ArrayObject`, e.g.:
 *
 * ```
 * marshalArray([1, 2, 3])
 * // => {a: 1, b: 2, c: 3, _array: ['a', 'b', 'c']}
 * ```
 *
 * This database storage method makes it easier to update a single field in a
 * deeply nested array object.
 */
export function marshalArray(arr: any[]): ArrayObject {
  if (!Array.isArray(arr)) {
    return arr;
  }
  const arrObject: ArrayObject = {_array: []};
  for (const item of arr) {
    const key = randString(6);
    arrObject[key] = item;
    arrObject._array.push(key);
  }
  return arrObject;
}

/**
 * Converts an `ArrayObject` to a normal array.
 */
export function unmarshalArray(arrObject: ArrayObject): any[] {
  if (!Array.isArray(arrObject?._array)) {
    return [];
  }
  const arr = arrObject._array.map((k: string) => arrObject[k]);
  return arr;
}

export async function cmsGetDocDiffSummary(
  docId: string,
  options?: {beforeVersion?: string; afterVersion?: string}
): Promise<string> {
  const res = await window.fetch('/cms/api/ai.diff', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      docId,
      beforeVersion: options?.beforeVersion || 'published',
      afterVersion: options?.afterVersion || 'draft',
    }),
  });

  const responseText = await res.text();
  let resData: any = null;
  try {
    resData = JSON.parse(responseText);
  } catch {
    // Ignore JSON parsing errors and fall back to the response text below.
  }

  if (!res.ok || resData?.success === false) {
    const errorMessage =
      (resData && (resData.error || resData.message)) || responseText;
    throw new Error(errorMessage || 'Failed to fetch AI summary');
  }

  if (typeof resData?.summary === 'string') {
    return resData.summary;
  }
  if (typeof resData?.data?.summary === 'string') {
    return resData.data.summary;
  }
  if (!resData && responseText) {
    return responseText;
  }
  return '';
}

function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

function randString(len: number): string {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) {
    const rand = Math.floor(Math.random() * chars.length);
    result.push(chars.charAt(rand));
  }
  return result.join('');
}

export function parseDocId(docId: string) {
  // TODO(stevenle): normalize improperly formatted docIds like 'Foo/bar/baz'.
  const [collection, slug] = docId.split('/');
  return {
    id: docId,
    collection: collection,
    slug: slug,
  };
}

/**
 * For doc JSON edits, deserializes the JSON data into a format that's
 * compatible with the db.
 *
 * Performs the following:
 * - Updates the "time" property in richtext data to the current timestamp
 * - Converts firestore timestamp data objects to Timestamp objects
 */
export function deserializeDocJson(data: any): any {
  // Convert firestore Timestamp objects.
  if (testIsFirestoreTimestampObject(data)) {
    return Timestamp.fromMillis(data.seconds * 1000);
  }
  // Update richtext time.
  if (testValidRichTextData(data)) {
    data.time = Date.now();
    return data;
  }
  // Recursively walk the data tree.
  if (Array.isArray(data)) {
    return data.map((item) => deserializeDocJson(item));
  }
  if (isObject(data)) {
    const copy: any = {};
    Object.keys(data).forEach((key) => {
      copy[key] = deserializeDocJson(data[key]);
    });
    return copy;
  }
  return data;
}

interface FirestireTimestampObject {
  type: 'firestore/timestamp/1.0';
  seconds: number;
  nanoseconds: number;
}

function testIsFirestoreTimestampObject(
  data: any
): data is FirestireTimestampObject {
  // {
  //   "type": "firestore/timestamp/1.0",
  //   "seconds": 1758632400,
  //   "nanoseconds": 0
  // }
  return data?.type === 'firestore/timestamp/1.0';
}
