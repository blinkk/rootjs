import {RootConfig} from '@blinkk/root';
import admin from 'firebase-admin';
import {CMSPlugin} from './plugin.js';

export interface CMSDoc<T> {
  sys: {
    createdAt: admin.firestore.Timestamp;
    createdBy: string;
    modifiedAt: admin.firestore.Timestamp;
    modifiedBy: string;
    publishedAt: admin.firestore.Timestamp;
    publishedBy: string;
  };
  fields: T;
}

function getFirebase(rootConfig: RootConfig) {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  const plugins = rootConfig.plugins || [];
  const plugin = plugins.find((plugin) => plugin.name === 'root-cms');
  if (!plugin) {
    throw new Error('could not find root-cms plugin config in root.config.ts');
  }

  const cmsPlugin = plugin as CMSPlugin;
  const config = cmsPlugin.getConfig();
  const gcpProjectId = config.firebaseConfig.projectId;
  return admin.initializeApp({
    projectId: gcpProjectId,
    credential: admin.credential.applicationDefault(),
  });
}

export async function getDoc<T>(
  rootConfig: RootConfig,
  collectionId: string,
  slug: string,
  options: {mode: 'draft' | 'published'}
): Promise<CMSDoc<T> | null> {
  const projectId = rootConfig.projectId || 'default';
  const mode = options.mode;
  const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
  const app = getFirebase(rootConfig);
  const db = admin.firestore(app);
  const docRef = db.doc(
    `Projects/${projectId}/Collections/${collectionId}/${modeCollection}/${slug}`
  );
  const doc = await docRef.get();
  if (doc.exists) {
    const data = doc.data();
    return data as CMSDoc<T>;
  }
  return null;
}
