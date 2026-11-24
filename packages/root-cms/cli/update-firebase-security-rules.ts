import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';
import {
  applySecurityRules,
  SecurityRulesMergeError,
  stampSecurityRulesVersion,
} from '../core/security.js';

export interface UpdateFirebaseSecurityRulesOptions {
  /** GCP project id. */
  project?: string;
  /** Overwrites live rules even when custom rules lack START/END markers. */
  force?: boolean;
}

/**
 * Fetches the project's live Firestore security rules, updates the Root.js CMS
 * managed block while preserving custom rules outside the START/END markers,
 * and records the updated version on `Projects/{projectId}`.
 */
export async function updateFirebaseSecurityRules(
  options: UpdateFirebaseSecurityRulesOptions
) {
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
  console.log('👮 updating firestore security rules...');
  let result;
  try {
    result = await applySecurityRules(gcpProjectId, {force: options.force});
  } catch (err) {
    if (err instanceof SecurityRulesMergeError) {
      console.error(err.message);
      console.error('Re-run with --force to replace the live ruleset anyway.');
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const db = cmsPlugin.getFirestore();
  const rootProjectId = cmsPluginOptions.id || 'default';
  await stampSecurityRulesVersion(db, rootProjectId, {
    firestore: result.version,
  });

  if (result.preservedCustomRules) {
    console.log(
      `✓ updated Firestore security rules to v${result.version} (custom rules preserved)`
    );
  } else {
    console.log(`✓ updated Firestore security rules to v${result.version}`);
  }
}
