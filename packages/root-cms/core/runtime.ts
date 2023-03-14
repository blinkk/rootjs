import {RootConfig} from '@blinkk/root';
import {CMSPlugin} from './plugin.js';

// NOTE(stevenle): for some reason, the firebase-admin import has issues with
// vite and es6-style imports, so we use `createRequire()` here to work around
// those issues.
// import admin from 'firebase-admin';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

function getFirebase(gcpProjectId: string) {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }
  return admin.initializeApp({
    projectId: gcpProjectId,
    credential: admin.credential.applicationDefault(),
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
  const app = getFirebase(gcpProjectId);
  const db = admin.firestore(app);
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
  const plugins = rootConfig.plugins || [];
  const plugin = plugins.find((plugin) => plugin.name === 'root-cms');
  if (!plugin) {
    throw new Error('could not find root-cms plugin config in root.config.ts');
  }
  return plugin as CMSPlugin;
}
