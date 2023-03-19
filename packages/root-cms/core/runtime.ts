import {Plugin, RootConfig} from '@blinkk/root';
import {initializeApp, getApps, applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
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

/**
 * Retrieves a doc from Root.js CMS.
 */
export async function getDoc<T>(
  rootConfig: RootConfig,
  collectionId: string,
  slug: string,
  options: {mode: 'draft' | 'published'}
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
        const arr = val._array.map((k: string) => val[k] || {});
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
