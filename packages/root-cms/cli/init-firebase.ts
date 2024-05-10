import {loadRootConfig} from '@blinkk/root/node';
import {Firestore} from 'firebase-admin/firestore';
import {getCmsPlugin} from '../core/client.js';
import {applySecurityRules} from '../core/security.js';

export interface InitFirebaseOptions {
  /** GCP project id. */
  project?: string;
  /** Adds an ADMIN to the security rules. */
  admin?: string;
}

export async function initFirebase(options: InitFirebaseOptions) {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsPlugin = getCmsPlugin(rootConfig);
  const cmsPluginOptions = cmsPlugin.getConfig();
  const gcpProjectId =
    options.project || cmsPluginOptions.firebaseConfig.projectId;

  if (!gcpProjectId) {
    throw new Error('firebaseConfig.projectId not set in cms plugin options');
  }

  console.log(`gcp project: ${gcpProjectId}`);
  console.log('👮 updating security rules...');
  await applySecurityRules(gcpProjectId);

  if (options.admin) {
    const db = cmsPlugin.getFirestore();
    const rootProjectId = cmsPluginOptions.id || 'default';
    await addAdmin(db, rootProjectId, options.admin);
  }

  console.log('done initializing firebase project!');
}

async function addAdmin(db: Firestore, projectId: string, email: string) {
  const dbPath = `Projects/${encodeURIComponent(projectId)}`;
  const docRef = db.doc(dbPath);
  const snapshot = await docRef.get();
  let data;
  if (snapshot.exists) {
    data = snapshot.data() || {};
  } else {
    data = {};
  }
  const roles = data.roles ?? {};
  roles[email] = 'ADMIN';
  data.roles = roles;
  await docRef.set(data);
  console.log(`added admin ${email} to project ${projectId}`);
}
