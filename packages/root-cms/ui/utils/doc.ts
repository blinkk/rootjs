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
} from 'firebase/firestore';
import {
  getTranslationsCollection,
  normalizeString,
  sourceHash,
} from './l10n.js';

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
  await runTransaction(db, async (transaction) => {
    // Delete the draft doc.
    transaction.delete(draftDocRef);
    // Delete the published doc.
    transaction.delete(publishedDocRef);
  });
}

export async function cmsPublishDoc(docId: string) {
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
  await runTransaction(db, async (transaction) => {
    const draftDoc = await getDoc(draftDocRef);
    if (!draftDoc.exists()) {
      throw new Error(`${draftDocRef.id} does not exist`);
    }

    const data = {...draftDoc.data()};
    const sys = data.sys ?? {};
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
    transaction.update(draftDocRef, {sys});
    // Copy the "draft" data to "published" data.
    transaction.set(publishedDocRef, {...data, sys});
    // Delete any "scheduled" docs if it exists.
    transaction.delete(scheduledDocRef);
  });
  console.log(`saved ${publishedDocRef.id}`);
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
    const draftDoc = await getDoc(draftDocRef);
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
  await runTransaction(db, async (transaction) => {
    // Update the "sys" metadata in the draft doc.
    transaction.update(draftDocRef, {
      'sys.modifiedAt': serverTimestamp(),
      'sys.modifiedBy': window.firebase.user.email,
      'sys.publishedAt': deleteField(),
      'sys.publishedBy': deleteField(),
      'sys.firstPublishedAt': deleteField(),
      'sys.firstPublishedBy': deleteField(),
    });
    // Delete the "scheduled" doc.
    transaction.delete(scheduledDocRef);
    // Delete the "published" doc.
    transaction.delete(publishedDocRef);
  });
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
    const publishedDoc = await getDoc(publishedDocRef);
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
  await runTransaction(db, async (transaction) => {
    // Update the "sys" metadata in the draft doc.
    transaction.update(draftDocRef, {
      'sys.modifiedAt': serverTimestamp(),
      'sys.modifiedBy': window.firebase.user.email,
      'sys.scheduledAt': deleteField(),
      'sys.scheduledBy': deleteField(),
    });
    // Delete the "scheduled" doc.
    transaction.delete(scheduledDocRef);
  });
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
    return locale;
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
      translation[locale] = normalizeString(str || '');
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
