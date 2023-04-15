import {RootConfig} from '@blinkk/root';

import {getCmsPlugin} from '../../core/runtime.js';
import {applySecurityRules} from '../../core/security.js';

export interface InitFirebaseOptions {
  /** GCP project id. */
  project?: string;
}

export function initFirebase(rootConfig: RootConfig) {
  return (options: InitFirebaseOptions) => {
    let gcpProjectId: string;
    if (options.project) {
      gcpProjectId = options.project;
    } else {
      const cmsPlugin = getCmsPlugin(rootConfig);
      const cmsPluginOptions = cmsPlugin.getConfig();
      gcpProjectId = cmsPluginOptions.firebaseConfig.projectId;
    }
    if (!gcpProjectId) {
      throw new Error('firebaseConfig.projectId not set in cms plugin options');
    }

    console.log(`gcp project: ${gcpProjectId}`);
    console.log('👮 updating security rules...');
    applySecurityRules(gcpProjectId);
    console.log('done initializing firebase project!');
  };
}
