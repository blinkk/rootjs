import {RootConfig} from '@blinkk/root';

import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';
import {applySecurityRules} from '../core/security.js';

export interface InitFirebaseOptions {
  /** GCP project id. */
  project?: string;
}

export async function initFirebase(options: InitFirebaseOptions) {
  let gcpProjectId: string;
  if (options.project) {
    gcpProjectId = options.project;
  } else {
    const rootDir = process.cwd();
    const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
    const cmsPlugin = getCmsPlugin(rootConfig);
    const cmsPluginOptions = cmsPlugin.getConfig();
    gcpProjectId = cmsPluginOptions.firebaseConfig.projectId;
  }
  if (!gcpProjectId) {
    throw new Error('firebaseConfig.projectId not set in cms plugin options');
  }

  console.log(`gcp project: ${gcpProjectId}`);
  console.log('👮 updating security rules...');
  await applySecurityRules(gcpProjectId);
  console.log('done initializing firebase project!');
}
