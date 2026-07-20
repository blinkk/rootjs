/**
 * Browser-side data layer for the v2 TranslationsManager (mirrors the
 * Firestore paths used by `core/translations-manager.ts`).
 *
 * Translations are stored in per-locale docs at:
 * ```
 * /Projects/{p}/TranslationsManager/{draft|published}/Translations/{normalizeSlug(id)}:{locale}
 * ```
 */

import {
  DocumentReference,
  Timestamp,
  WriteBatch,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {normalizeSlug} from '../../shared/slug.js';
import {hashStr, normalizeStr} from '../../shared/strings.js';
import {logAction} from './actions.js';
import {MultiBatch} from './batch.js';
import {getLocalesForTranslationLanguage} from './l10n.js';

/**
 * Firestore limits `in` queries to 10 values, so larger queries are broken up
 * into chunks.
 */
const IN_QUERY_CHUNK_SIZE = 10;

/**
 * Firestore batches allow a max of 500 write ops. Use a lower limit to leave
 * headroom for callers that add their own ops to a shared batch.
 */
const MAX_BATCH_OPS = 400;

export interface TranslationsLocaleDoc {
  /** Translations id, e.g. `Pages/foo--bar` or `common`. */
  id: string;
  locale: string;
  tags?: string[];
  strings: {
    [hash: string]: {source: string; translation: string};
  };
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
    publishedAt?: Timestamp;
    publishedBy?: string;
    linkedSheet?: {
      spreadsheetId: string;
      gid: number;
      linkedAt: Timestamp;
      linkedBy: string;
    };
  };
}

export interface TranslationsLocaleDocWithRef {
  ref: DocumentReference;
  data: TranslationsLocaleDoc;
}

/**
 * Summary of a translations doc (all of its locale docs grouped by id), used
 * by the translations manager list page.
 */
export interface TranslationsDocSummary {
  id: string;
  /** Locales that have a draft locale doc. */
  locales: string[];
  modifiedAt?: Timestamp;
  modifiedBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
  hasUnpublishedChanges: boolean;
}

export interface TranslationsDocData {
  id: string;
  draft: Record<string, TranslationsLocaleDoc>;
  published: Record<string, TranslationsLocaleDoc>;
}

/**
 * An edit to a source string's translations, keyed by "translation language"
 * (which may be shared by multiple root locales per the
 * `i18n.translationLanguages` config).
 */
export interface TranslationsEdit {
  source: string;
  translations: Record<string, string>;
}

export type TranslationsDocMode = 'draft' | 'published';

function getTranslationsManagerCollection(mode: TranslationsDocMode) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  return collection(
    db,
    'Projects',
    projectId,
    'TranslationsManager',
    mode,
    'Translations'
  );
}

function getTranslationsLocaleDocRef(
  mode: TranslationsDocMode,
  id: string,
  locale: string
) {
  return doc(
    getTranslationsManagerCollection(mode),
    `${normalizeSlug(id)}:${locale}`
  );
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function toMillis(ts?: Timestamp) {
  return ts?.toMillis ? ts.toMillis() : 0;
}

/**
 * Lists all translations docs (draft), grouped by translations id.
 *
 * NOTE: the locale docs are grouped by the doc data's `id` field rather than
 * by parsing the `{id}:{locale}` doc key, which would be ambiguous with
 * slugs containing `--`.
 */
export async function listTranslationsDocs(): Promise<
  TranslationsDocSummary[]
> {
  const snapshot = await getDocs(getTranslationsManagerCollection('draft'));
  const byId: Record<string, TranslationsDocSummary> = {};
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() as TranslationsLocaleDoc;
    if (!data.id) {
      return;
    }
    const summary = (byId[data.id] ??= {
      id: data.id,
      locales: [],
      hasUnpublishedChanges: false,
    });
    if (data.locale) {
      summary.locales.push(data.locale);
    }
    // The doc's modified/published timestamps are the max across its locale
    // docs.
    if (toMillis(data.sys?.modifiedAt) > toMillis(summary.modifiedAt)) {
      summary.modifiedAt = data.sys.modifiedAt;
      summary.modifiedBy = data.sys.modifiedBy;
    }
    if (toMillis(data.sys?.publishedAt) > toMillis(summary.publishedAt)) {
      summary.publishedAt = data.sys.publishedAt;
      summary.publishedBy = data.sys.publishedBy;
    }
  });
  const summaries = Object.values(byId);
  summaries.forEach((summary) => {
    summary.locales.sort();
    summary.hasUnpublishedChanges =
      !summary.publishedAt ||
      toMillis(summary.modifiedAt) > toMillis(summary.publishedAt);
  });
  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/**
 * Loads the draft and published locale docs for a translations doc id, keyed
 * by locale.
 */
export async function loadTranslationsDoc(
  id: string
): Promise<TranslationsDocData> {
  const [draft, published] = await Promise.all(
    (['draft', 'published'] as TranslationsDocMode[]).map(async (mode) => {
      const q = query(
        getTranslationsManagerCollection(mode),
        where('id', '==', id)
      );
      const snapshot = await getDocs(q);
      const byLocale: Record<string, TranslationsLocaleDoc> = {};
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data() as TranslationsLocaleDoc;
        if (data.locale) {
          byLocale[data.locale] = data;
        }
      });
      return byLocale;
    })
  );
  return {id, draft, published};
}

/**
 * Fetches the draft translations locale docs (with their doc refs) for a set
 * of translations doc ids, grouped by id. Used to publish a doc's
 * translations in the same batch as the doc itself.
 */
export async function getDraftTranslationsLocaleDocs(
  ids: string[]
): Promise<Record<string, TranslationsLocaleDocWithRef[]>> {
  return getTranslationsLocaleDocs(ids, 'draft');
}

/**
 * Fetches the translations locale docs (with their doc refs) for a set of
 * translations doc ids, grouped by id.
 */
export async function getTranslationsLocaleDocs(
  ids: string[],
  mode: TranslationsDocMode
): Promise<Record<string, TranslationsLocaleDocWithRef[]>> {
  const localeDocsById: Record<string, TranslationsLocaleDocWithRef[]> = {};
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return localeDocsById;
  }
  const colRef = getTranslationsManagerCollection(mode);
  const snapshots = await Promise.all(
    chunkArray(uniqueIds, IN_QUERY_CHUNK_SIZE).map((chunk) =>
      getDocs(query(colRef, where('id', 'in', chunk)))
    )
  );
  snapshots.forEach((snapshot) => {
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as TranslationsLocaleDoc;
      localeDocsById[data.id] ??= [];
      localeDocsById[data.id].push({ref: docSnapshot.ref, data});
    });
  });
  return localeDocsById;
}

/**
 * Saves draft translations edits for a translations doc id. Each edit's
 * translations are keyed by "translation language", which is expanded to the
 * root locales that share it (per `i18n.translationLanguages`).
 */
export async function saveDraftTranslations(
  id: string,
  edits: TranslationsEdit[],
  options?: {tags?: string[]}
) {
  const db = window.firebase.db;
  const modifiedBy = window.firebase.user.email || 'root-cms-ui';

  // Group the edits by root locale:
  // {locale: {hash: {source, translation}}}
  const stringsByLocale: Record<
    string,
    Record<string, {source: string; translation: string}>
  > = {};
  for (const edit of edits) {
    const source = normalizeStr(edit.source);
    if (!source) {
      continue;
    }
    const hash = hashStr(source);
    for (const [lang, translation] of Object.entries(edit.translations)) {
      for (const locale of getLocalesForTranslationLanguage(lang)) {
        stringsByLocale[locale] ??= {};
        stringsByLocale[locale][hash] = {
          source,
          translation: normalizeStr(translation || ''),
        };
      }
    }
  }

  const locales = Object.keys(stringsByLocale);
  if (locales.length === 0) {
    return;
  }

  let batch = writeBatch(db);
  let numOps = 0;
  for (const locale of locales) {
    const localeDocRef = getTranslationsLocaleDocRef('draft', id, locale);
    const updates: Record<string, any> = {
      id: id,
      locale: locale,
      strings: stringsByLocale[locale],
      sys: {
        modifiedAt: Timestamp.now(),
        modifiedBy: modifiedBy,
      },
    };
    if (options?.tags && options.tags.length > 0) {
      updates.tags = arrayUnion(...options.tags);
    }
    batch.set(localeDocRef, updates, {merge: true});
    numOps += 1;
    if (numOps >= MAX_BATCH_OPS) {
      await batch.commit();
      batch = writeBatch(db);
      numOps = 0;
    }
  }
  if (numOps > 0) {
    await batch.commit();
  }
  logAction('translations.save_draft', {metadata: {translationsId: id}});
}

/**
 * Adds the write ops for publishing a set of draft translations locale docs
 * to a batch: updates each draft doc's `sys` with `publishedAt/By` and copies
 * the doc to the published collection. Returns the number of ops added to
 * the batch (2 per locale doc).
 */
export function addPublishTranslationsOpsToBatch(
  batch: WriteBatch | MultiBatch,
  localeDocs: TranslationsLocaleDocWithRef[]
): number {
  const publishedBy = window.firebase.user.email || 'root-cms-ui';
  let numOps = 0;
  for (const localeDoc of localeDocs) {
    const data = localeDoc.data;
    const sys = {
      ...data.sys,
      publishedAt: Timestamp.now(),
      publishedBy: publishedBy,
    };
    batch.update(localeDoc.ref, {sys});
    const publishedDocRef = getTranslationsLocaleDocRef(
      'published',
      data.id,
      data.locale
    );
    batch.set(publishedDocRef, {...data, sys});
    numOps += 2;
  }
  return numOps;
}

/**
 * Publishes a translations doc (copies the draft locale docs to the
 * published collection).
 */
export async function publishTranslations(id: string) {
  const db = window.firebase.db;
  const localeDocsById = await getTranslationsLocaleDocs([id], 'draft');
  const localeDocs = localeDocsById[id] || [];
  if (localeDocs.length === 0) {
    throw new Error(`no draft translations to publish for ${id}`);
  }
  const batch = writeBatch(db);
  addPublishTranslationsOpsToBatch(batch, localeDocs);
  await batch.commit();
  logAction('translations.publish', {metadata: {translationsId: id}});
}

/**
 * Adds the write ops for unpublishing translations to a batch: deletes the
 * published locale docs and clears the published metadata from the draft
 * locale docs. Returns the number of ops added.
 */
export function addUnpublishTranslationsOpsToBatch(
  batch: WriteBatch | MultiBatch,
  draftLocaleDocs: TranslationsLocaleDocWithRef[],
  publishedLocaleDocs: TranslationsLocaleDocWithRef[]
): number {
  let numOps = 0;
  for (const localeDoc of publishedLocaleDocs) {
    batch.delete(localeDoc.ref);
    numOps += 1;
  }
  for (const localeDoc of draftLocaleDocs) {
    batch.update(localeDoc.ref, {
      'sys.publishedAt': deleteField(),
      'sys.publishedBy': deleteField(),
    });
    numOps += 1;
  }
  return numOps;
}

/**
 * Unpublishes a translations doc: deletes the published locale docs and
 * clears the published metadata from the draft locale docs.
 */
export async function unpublishTranslations(id: string) {
  const db = window.firebase.db;
  const [draftDocsById, publishedDocsById] = await Promise.all([
    getTranslationsLocaleDocs([id], 'draft'),
    getTranslationsLocaleDocs([id], 'published'),
  ]);
  const batch = writeBatch(db);
  addUnpublishTranslationsOpsToBatch(
    batch,
    draftDocsById[id] || [],
    publishedDocsById[id] || []
  );
  await batch.commit();
  logAction('translations.unpublish', {metadata: {translationsId: id}});
}

/**
 * Adds ops to a batch that remove all of a translations doc's locale docs
 * (draft and published). Returns the number of ops added.
 */
export function addDeleteTranslationsOpsToBatch(
  batch: WriteBatch | MultiBatch,
  localeDocs: TranslationsLocaleDocWithRef[]
): number {
  for (const localeDoc of localeDocs) {
    batch.delete(localeDoc.ref);
  }
  return localeDocs.length;
}

/**
 * Deletes a translations doc (all of its draft and published locale docs).
 */
export async function deleteTranslationsDoc(id: string) {
  const db = window.firebase.db;
  const [draftDocsById, publishedDocsById] = await Promise.all([
    getTranslationsLocaleDocs([id], 'draft'),
    getTranslationsLocaleDocs([id], 'published'),
  ]);
  const batch = writeBatch(db);
  addDeleteTranslationsOpsToBatch(batch, [
    ...(draftDocsById[id] || []),
    ...(publishedDocsById[id] || []),
  ]);
  await batch.commit();
  logAction('translations.delete', {metadata: {translationsId: id}});
}

/**
 * Deletes the draft and published translations locale docs for a set of ids
 * without logging an action. Used when deleting a content doc.
 */
export async function deleteTranslationsForDocIds(ids: string[]) {
  const db = window.firebase.db;
  const [draftDocsById, publishedDocsById] = await Promise.all([
    getTranslationsLocaleDocs(ids, 'draft'),
    getTranslationsLocaleDocs(ids, 'published'),
  ]);
  const localeDocs = [
    ...Object.values(draftDocsById).flat(),
    ...Object.values(publishedDocsById).flat(),
  ];
  if (localeDocs.length === 0) {
    return;
  }
  for (const chunk of chunkArray(localeDocs, MAX_BATCH_OPS)) {
    const batch = writeBatch(db);
    addDeleteTranslationsOpsToBatch(batch, chunk);
    await batch.commit();
  }
}

/**
 * Returns true if the v2 translations manager is enabled via the
 * `experiments.v2TranslationsManager` flag.
 */
export function testV2TranslationsEnabled(): boolean {
  return Boolean(window.__ROOT_CTX.experiments?.v2TranslationsManager);
}
