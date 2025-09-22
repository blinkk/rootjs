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
} from 'firebase/firestore';
import {testValidRichTextData} from '../../shared/richtext.js';
import {logAction} from './actions.js';
import {removeDocFromCache, removeDocsFromCache} from './doc-cache.js';
import {GoogleSheetId} from './gsheets.js';
import {
  getTranslationsCollection,
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
    scheduledAt: Timestamp;
    scheduledBy: string;
    firstPublishedAt: Timestamp;
    firstPublishedBy: string;
    publishedAt: Timestamp;
    publishedBy: string;
    publishingLocked: {
      lockedAt: string;
      lockedBy: string;
      reason: string;
      until?: Timestamp;
    };
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

export async function cmsPublishDoc(docId: string) {
  await cmsPublishDocs([docId]);
}

/**
 * Batch publishes a group of docs.
 */
export async function cmsPublishDocs(
  docIds: string[],
  options?: {batch?: WriteBatch; releaseId?: string}
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
    updatePublishedDocDataInBatch(batch, docId, draftData, versionTags);
  });
  await batch.commit();

  if (docIds.length === 1) {
    console.log(`published ${docIds[0]}`);
  } else {
    console.log(`published ${docIds.length} docs: ${docIds.join(', ')}`);
  }

  for (const docId of docIds) {
    logAction('doc.publish', {metadata: {docId}});
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
  versionTags: string[]
) {
  if (testPublishingLocked(draftData)) {
    throw new Error(`publishing is locked for doc: ${draftData.id}`);
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
  batch.set(versionRef, versionData);
}

/**
 * Schedules a CMS doc to be published at some time in the future.
 */
export async function cmsScheduleDoc(docId: string, millis: number) {
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
    // Copy the "draft" data to "published" data.
    transaction.set(scheduledDocRef, {...data, sys});
  });
  console.log(`saved ${scheduledDocRef.id}`);

  logAction('doc.schedule', {metadata: {docId, scheduledAt: millis}});
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
  const fields = fromDoc.data().fields ?? {};
  await cmsCreateDoc(toDocId, {fields, overwrite: options?.overwrite});
}

export async function cmsCreateDoc(
  docId: string,
  options?: {fields?: Record<string, any>; overwrite?: boolean}
) {
  const [collectionId, slug] = docId.split('/');
  const docRef = getDraftDocRef(docId);
  const doc = await getDoc(docRef);
  if (doc.exists() && !options?.overwrite) {
    throw new Error(`${docId} already exists`);
  }
  const data = {
    id: docId,
    collection: collectionId,
    slug: slug,
    sys: {
      createdAt: serverTimestamp(),
      createdBy: window.firebase.user.email,
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
      locales: ['en'],
    },
    fields: options?.fields ?? {},
  };

  // Preserve "sys" values when copying and overwriting a doc.
  if (doc.exists() && options?.overwrite) {
    const oldData = doc.data();
    data.sys = {
      ...oldData.sys,
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
    };
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
  options?: {tags?: string[]}
) {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];

  function normalizeLocale(locale: string) {
    for (const l of i18nLocales) {
      if (String(l).toLowerCase() === locale.toLowerCase()) {
        return l;
      }
    }
    // Ignore locales that are not in the root config.
    return null;
  }

  const translationsMap: Record<string, CsvTranslation> = {};
  for (const row of csvData) {
    if (!row.source) {
      continue;
    }
    const translation: CsvTranslation = {
      source: normalizeString(row.source),
    };
    Object.entries(row).forEach(([column, str]) => {
      if (column === 'source') {
        return;
      }
      const locale = normalizeLocale(column);
      if (locale) {
        translation[locale] = normalizeString(str || '');
      }
    });

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
  logAction('doc.import_translations', {metadata: {docId}});
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

export async function cmsListVersions(
  docId: string,
  options?: {tags?: string[]}
) {
  const db = window.firebase.db;
  const docRef = getDraftDocRef(docId);
  const versionsCollection = collection(db, docRef.path, 'Versions');
  let q: Query = query(versionsCollection, orderBy('sys.modifiedAt', 'desc'));
  if (options?.tags) {
    q = query(q, where('tags', 'array-contains-any', options.tags));
  }
  const querySnapshot = await getDocs(q);
  const versions: Version[] = [];
  querySnapshot.forEach((doc) => {
    const version = {
      ...(doc.data() as Version),
      _versionId: doc.id,
    };
    versions.push(version);
  });
  return versions;
}

export async function cmsRestoreVersion(docId: string, version: Version) {
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

export async function cmsReadDocVersion(
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

export async function cmsGetDocDiffSummary(docId: string): Promise<string> {
  const res = await window.fetch('/cms/api/ai.diff', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      docId,
      beforeVersion: 'published',
      afterVersion: 'draft',
    }),
  });

  const responseText = await res.text();
  let resData: any = null;
  try {
    resData = JSON.parse(responseText);
  } catch (err) {
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
