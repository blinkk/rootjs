import {
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {sourceHash} from './l10n.js';

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
    const draftDoc = await transaction.get(draftDocRef);
    if (!draftDoc.exists()) {
      throw new Error(`${draftDocRef.id} does not exist`);
    }
    const data = {...draftDoc.data()};
    const sys = data.sys ?? {};
    sys.modifiedAt = serverTimestamp();
    sys.modifiedBy = window.firebase.user.email;
    delete sys.publishedAt;
    delete sys.publishedBy;
    delete sys.firstPublishedAt;
    delete sys.firstPublishedBy;

    // Update the "sys" metadata in the draft doc.
    transaction.update(draftDocRef, {sys});
    // Delete the "published" doc.
    transaction.delete(publishedDocRef);
  });
}

export async function cmsCopyDoc(fromDocId: string, toDocId: string) {
  const fromDocRef = getDocRef(fromDocId);
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
  const docRef = getDocRef(docId);
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
  csvData: CsvTranslation[]
) {
  const translationsDocRef = getTranslationsDocRef(docId);
  const translationsMap: Record<string, CsvTranslation> = {};

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];

  function normalizeStr(str: string) {
    return String(str).trim();
  }

  function normalizeLocale(locale: string) {
    for (const l of i18nLocales) {
      if (String(l).toLowerCase() === locale.toLowerCase()) {
        return l;
      }
    }
    return locale;
  }

  for (const row of csvData) {
    if (!row.source) {
      continue;
    }
    const translation: CsvTranslation = {
      source: normalizeStr(row.source),
    };
    Object.entries(row).forEach(([column, str]) => {
      if (column === 'source') {
        return;
      }
      const locale = normalizeLocale(column);
      translation[locale] = normalizeStr(str || '');
    });

    const hash = await sourceHash(translation.source);
    translationsMap[hash] = translation;
  }

  const db = window.firebase.db;
  await runTransaction(db, async (transaction) => {
    const translationsDoc = await transaction.get(translationsDocRef);
    const currentData = translationsDoc.data() || {};
    const data = {...currentData};
    data.sys = {
      ...(data.sys ?? {}),
      modifiedAt: serverTimestamp(),
      modifiedBy: window.firebase.user.email,
    };
    data.translations = {
      ...(data.translations ?? {}),
      ...translationsMap,
    };
    transaction.set(translationsDocRef, data);
  });
}

export function getDocRef(docId: string) {
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

export function getTranslationsDocRef(docId: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const [collectionId, slug] = docId.split('/');
  return doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Translations',
    slug
  );
}
