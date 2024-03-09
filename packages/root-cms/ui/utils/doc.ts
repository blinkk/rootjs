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
  WriteBatch,
} from 'firebase/firestore';
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
  };
  fields: any;
}

export type Version = CMSDoc;

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
}

export async function cmsPublishDoc(docId: string) {
  await cmsPublishDocs([docId]);
}

/**
 * Batch publishes a group of docs.
 */
export async function cmsPublishDocs(docIds: string[]) {
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
  const batch = writeBatch(db);
  docIds.forEach((docId) => {
    const draftData = draftDocs[docId];
    if (!draftData) {
      throw new Error(`doc does not exist: ${docId}`);
    }
    updatePublishedDocDataInBatch(batch, docId, draftData);
  });
  await batch.commit();

  if (docIds.length === 1) {
    console.log(`published ${docIds[0]}`);
  } else {
    console.log(`published ${docIds.length} docs: ${docIds.join(', ')}`);
  }
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
  draftData: CMSDoc
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
}

export async function cmsCopyDoc(fromDocId: string, toDocId: string) {
  const fromDocRef = getDraftDocRef(fromDocId);
  const fromDoc = await getDoc(fromDocRef);
  if (!fromDoc.exists()) {
    throw new Error(`doc ${fromDocId} does not exist`);
  }
  const fields = fromDoc.data().fields ?? {};
  await cmsCreateDoc(toDocId, {fields});
}

export async function cmsCreateDoc(
  docId: string,
  options?: {fields?: Record<string, any>}
) {
  const [collectionId, slug] = docId.split('/');
  const docRef = getDraftDocRef(docId);
  const doc = await getDoc(docRef);
  if (doc.exists()) {
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
  await setDoc(docRef, data);
}

export interface CsvTranslation {
  [key: string]: string;
  source: string;
}

export async function cmsDocImportCsv(
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

export async function cmsListVersions(docId: string) {
  const db = window.firebase.db;
  const docRef = getDraftDocRef(docId);
  const versionsCollection = collection(db, docRef.path, 'Versions');
  const q = query(versionsCollection, orderBy('sys.modifiedAt', 'desc'));
  const querySnapshot = await getDocs(q);
  const versions: Version[] = [];
  querySnapshot.forEach((doc) => {
    versions.push(doc.data() as Version);
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
