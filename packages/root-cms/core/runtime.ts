import {Plugin, RootConfig} from '@blinkk/root';
import {initializeApp, getApps, applicationDefault} from 'firebase-admin/app';
import {Query, getFirestore} from 'firebase-admin/firestore';
import {CMSPlugin} from './plugin.js';

export function getFirebaseApp(gcpProjectId: string) {
  const apps = getApps();
  if (apps.length > 0 && apps[0]) {
    return apps[0];
  }
  return initializeApp({
    projectId: gcpProjectId,
    credential: applicationDefault(),
  });
}

export interface GetDocOptions {
  mode: 'draft' | 'published';
}

/**
 * Retrieves a doc from Root.js CMS.
 */
export async function getDoc<T>(
  rootConfig: RootConfig,
  collectionId: string,
  slug: string,
  options: GetDocOptions
): Promise<T | null> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const gcpProjectId = cmsPluginOptions.firebaseConfig.projectId;
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = getFirebaseApp(gcpProjectId);
  const db = getFirestore(app);
  // Slugs with slashes are encoded as `--` in the DB.
  slug = slug.replaceAll('/', '--');
  const dbPath = `Projects/${projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
  const docRef = db.doc(dbPath);
  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data();
    return normalizeData(data) as T;
  }
  console.log(`doc not found: ${dbPath}`);
  return null;
}

export interface ListDocsOptions {
  mode: 'draft' | 'published';
  offset?: number;
  limit?: number;
  orderBy?: string;
  orderByDirection?: 'asc' | 'desc';
  // TODO(stevenle): support filters.
}

/**
 * Lists docs from a Root.js CMS collection.
 */
export async function listDocs<T>(
  rootConfig: RootConfig,
  collectionId: string,
  options: ListDocsOptions
): Promise<{docs: T[]}> {
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const projectId = cmsPluginOptions.id || 'default';
  const gcpProjectId = cmsPluginOptions.firebaseConfig.projectId;
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = getFirebaseApp(gcpProjectId);
  const db = getFirestore(app);
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
  const results = await query.get();
  const docs: T[] = [];
  results.forEach((result) => {
    const doc = normalizeData(result.data()) as T;
    docs.push(doc);
  });
  return {docs};
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
export function normalizeData(data: any): any {
  const result: any = {};
  for (const key in data) {
    const val = data[key];
    if (isObject(val)) {
      if (val.toMillis) {
        result[key] = val.toMillis();
      } else if (Object.hasOwn(val, '_array') && Array.isArray(val._array)) {
        const arr = val._array.map((k: string) => normalizeData(val[k] || {}));
        result[key] = arr;
      } else {
        result[key] = normalizeData(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

export function getCmsPlugin(rootConfig: RootConfig): CMSPlugin {
  const plugins: Plugin[] = rootConfig.plugins || [];
  const plugin = plugins.find((plugin) => plugin.name === 'root-cms');
  if (!plugin) {
    throw new Error('could not find root-cms plugin config in root.config.ts');
  }
  return plugin as CMSPlugin;
}
