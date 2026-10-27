/** @deprecated Use client.ts instead. */

import {RootConfig} from '@blinkk/root';
import {Query} from 'firebase-admin/firestore';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {normalizeSlug} from '../shared/slug.js';
import {
  LoadTranslationsOptions,
  LocaleTranslations,
  RootCMSClient,
  Translation,
  TranslationsMap,
  getCmsPlugin,
  translationsForLocale,
  unmarshalData,
} from './client.js';

/**
 * Retrieves a doc from Root.js CMS.
 * @deprecated Use RootCMSClient.getDoc() instead.
 */
export async function getDoc<T>(
  rootConfig: RootConfig,
  collectionId: string,
  slug: string,
  options: {
    mode: 'draft' | 'published';
  }
): Promise<T | null> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const db = cmsPlugin.getFirestore();
  // Slugs with slashes are encoded as `--` in the DB.
  slug = normalizeSlug(slug);
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
  const docRef = db.doc(dbPath);
  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data();
    return unmarshalData(data) as T;
  }
  console.log(`doc not found: ${dbPath}`);
  return null;
}

/**
 * Lists docs from a Root.js CMS collection.
 * @deprecated Use RootCMSClient.listDocs() instead.
 */
export async function listDocs<T>(
  rootConfig: RootConfig,
  collectionId: string,
  options: {
    mode: 'draft' | 'published';
    offset?: number;
    limit?: number;
    orderBy?: string;
    orderByDirection?: 'asc' | 'desc';
    query?: (query: Query) => Query;
  }
): Promise<{docs: T[]}> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const db = cmsPlugin.getFirestore();
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}`;
  let query: Query = db.collection(dbPath);
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.offset) {
    query = query.offset(options.offset);
  }
  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.orderByDirection);
  }
  if (options.query) {
    query = options.query(query);
  }
  const results = await query.get();
  const docs: T[] = [];
  results.forEach((result) => {
    const doc = unmarshalData(result.data()) as T;
    docs.push(doc);
  });
  return {docs};
}

/**
 * Returns the number of docs in a Root.js CMS collection.
 * @deprecated Use RootCMSClient.getDocsCount() instead.
 */
export async function numDocs(
  rootConfig: RootConfig,
  collectionId: string,
  options: {
    mode: 'draft' | 'published';
    query?: (query: Query) => Query;
  }
) {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const db = cmsPlugin.getFirestore();
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}`;
  let query: Query = db.collection(dbPath);
  if (options.query) {
    query = options.query(query);
  }
  const results = await query.count().get();
  const count = results.data().count;
  return count;
}

/**
 * Publishes scheduled docs.
 * @deprecated Use RootCMSClient.publishScheduledDocs() instead.
 */
export async function publishScheduledDocs(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  return await cmsClient.publishScheduledDocs();
}

/**
 * @deprecated Use `RootCMSClient.loadTranslations()`.
 */
export async function loadTranslations(
  rootConfig: RootConfig,
  options?: LoadTranslationsOptions
): Promise<TranslationsMap> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const db = cmsPlugin.getFirestore();

  const dbPath = `Projects/${projectId}/Translations`;
  let query: Query = db.collection(dbPath);
  if (options?.tags) {
    query = query.where('tags', 'array-contains-any', options.tags);
  }

  const querySnapshot = await query.get();
  const translationsMap: TranslationsMap = {};
  querySnapshot.forEach((doc) => {
    const hash = doc.id;
    translationsMap[hash] = doc.data() as Translation;
  });
  return translationsMap;
}

/**
 * @deprecated Use `RootCMSClient.loadTranslationsForLocale()`.
 */
export async function loadTranslationsForLocale(
  rootConfig: RootConfig,
  locale: string,
  options?: LoadTranslationsOptions
): Promise<LocaleTranslations> {
  const translationsMap = await loadTranslations(rootConfig, options);
  const fallbackLocales = resolveLocaleFallbacks(rootConfig.i18n, locale);
  return translationsForLocale(translationsMap, fallbackLocales);
}
