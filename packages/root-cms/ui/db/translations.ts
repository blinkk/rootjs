/**
 * Utility functions for reading and writing translations from the db.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import {GoogleSheetId} from '@/utils/gsheets.js';
import {normalizeString, sourceHash} from '@/utils/l10n.js';
import {logAction} from './actions.js';
import {getDraftDocRef} from './docs.js';

export interface Translations {
  [locale: string]: string;
  source: string;
}

export interface TranslationsMap {
  [hash: string]: Translations;
}

export interface TranslationsLinkedSheet {
  spreadsheetId: string;
  gid: number;
  linkedAt: Timestamp;
  linkedBy: string;
}

export interface TranslationsDoc {
  id: string;
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
    publishedAt?: Timestamp;
    publishedBy?: string;
    linkedSheet?: TranslationsLinkedSheet;
  };
  strings: TranslationsMap;
}

/**
 * Saves translations to `/Projects/<project>/TranslationsManager/draft/<translationsId>`
 * where the translations map is in the following format:
 *
 * ```
 * {
 *   "<source hash>": {"source": "...", "<locale>": "<translation>"}
 * }
 * ```
 */
export async function dbSaveTranslations(
  translationsId: string,
  translationsMap: TranslationsMap
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'draft',
    'Translations',
    translationsId.replaceAll('/', '--')
  );
  const snapshot = await getDoc(docRef);
  const data = snapshot.data() || {
    id: translationsId.replaceAll('--', '/'),
    sys: {},
    strings: {},
  };
  data.sys.modifiedAt = serverTimestamp();
  data.sys.modifiedBy = window.firebase.user.email;

  const strings = data.strings || {};
  Object.entries(translationsMap).forEach(([hash, translations]) => {
    strings[hash] = {...strings[hash], ...translations};
  });
  data.strings = strings;
  await setDoc(docRef, data);
  logAction('translations.save', {metadata: {translationsId}});
  return strings;
}

/**
 * Fetches the translations doc from `/Projects/<project>/TranslationsManager/draft/<translationsId>`.
 */
export async function dbGetTranslationsDoc(
  translationsId: string
): Promise<TranslationsDoc | null> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'draft',
    'Translations',
    translationsId.replaceAll('/', '--')
  );
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as TranslationsDoc;
}

/**
 * Gets translations from `/Projects/<project>/TranslationsManager/draft/<translationsId>`.
 */
export async function dbGetTranslations(
  translationsId: string
): Promise<TranslationsMap> {
  const translationsDoc = await dbGetTranslationsDoc(translationsId);
  return translationsDoc?.strings || {};
}

/**
 * Publishes translations to `/Projects/<project>/TranslationsManager/published/<translationsId>`.
 */
export async function dbPublishTranslationsDoc(
  translationsId: string,
  options?: {batch?: WriteBatch}
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docSlug = translationsId.replaceAll('/', '--');
  const draftRef = doc(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'draft',
    'Translations',
    docSlug
  );
  const snapshot = await getDoc(draftRef);

  if (!snapshot.exists()) {
    // Ignore missing translations.
    console.warn(`translations ${translationsId} does not exist`);
    return;
  }

  // If the translations publishing is tied to another batch request (e.g. doc
  // publishing), the batch request will be committed upstream.
  const commitBatch = !options?.batch;

  const batch = options?.batch || writeBatch(db);
  batch.update(draftRef, {
    'sys.publishedAt': serverTimestamp(),
    'sys.publishedBy': window.firebase.user.email,
  });

  const publishedRef = doc(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'published',
    'Translations',
    docSlug
  );
  const data = {...snapshot.data()};
  if (!data.sys) {
    data.sys = {};
  }
  data.sys.publishedAt = serverTimestamp();
  data.sys.publishedBy = window.firebase.user.email;
  batch.set(publishedRef, data);
  if (commitBatch) {
    await batch.commit();
    logAction('translations.publish', {metadata: {translationsId}});
  }
}

/**
 * Lists translation docs in the TranslationsManager.
 */
export async function dbListTranslationsDocs(): Promise<TranslationsDoc[]> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const versionsCollection = collection(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'draft',
    'Translations'
  );
  const q = query(versionsCollection);
  const querySnapshot = await getDocs(q);
  const translationDocs: TranslationsDoc[] = [];
  querySnapshot.forEach((doc) => {
    translationDocs.push(doc.data() as TranslationsDoc);
  });
  return translationDocs;
}

/**
 * Converts a translations id (e.g. `Pages--foo--bar`) to a doc id (e.g.
 * `Pages/foo--bar`).
 */
export function translationsIdToDocId(translationsId: string): string {
  let docId = translationsId;
  if (!docId.includes('/') && translationsId.includes('--')) {
    docId = translationsId.replace('--', '/');
  }
  return docId;
}

/**
 * Converts an array of CSV data to a TranslationsMap.
 */
export async function csvToTranslationsMap(
  rows: Translations[]
): Promise<TranslationsMap> {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const strings: TranslationsMap = {};
  for (const row of rows) {
    if (row.source) {
      const hash = await sourceHash(row.source);
      const cleanRows: Translations = {source: normalizeString(row.source)};
      for (const locale of i18nLocales) {
        if (row[locale]) {
          cleanRows[locale] = normalizeString(row[locale]);
        }
      }
      strings[hash] = cleanRows;
    }
  }
  return strings;
}

/**
 * Links a Google Sheet to a doc for localization.
 */
export async function dbTranslationsLinkGoogleSheet(
  translationsId: string,
  sheetId: GoogleSheetId
) {
  if (!sheetId?.spreadsheetId) {
    throw new Error('no spreadsheet id');
  }
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    'draft',
    'Translations',
    translationsId.replaceAll('/', '--')
  );
  const updates = {
    'sys.linkedSheet': {
      spreadsheetId: sheetId.spreadsheetId,
      gid: sheetId.gid || 0,
      linkedAt: serverTimestamp(),
      linkedBy: window.firebase.user.email,
    },
  };
  await updateDoc(docRef, updates);
  logAction('translations.link_sheet', {
    metadata: {translationsId: translationsId, sheetId: sheetId},
  });
}
