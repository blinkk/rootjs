import {loadRootConfig} from '@blinkk/root/node';
import {getCmsPlugin} from '../core/client.js';
import {
  applySecurityRules,
  applyStorageSecurityRules,
  SecurityRulesMergeError,
  stampSecurityRulesVersion,
  writeCachedSecurityRulesVersion,
} from '../core/security.js';

export interface UpdateFirebaseSecurityRulesOptions {
  /** GCP project id. */
  project?: string;
  /** Firestore database id (defaults to `firebaseConfig.databaseId` or `'(default)'`). */
  database?: string;
  /** Overwrites live rules even when custom rules lack BEGIN/END markers. */
  force?: boolean;
}

/**
 * Fetches the project's live Firestore and Storage security rules, updates the
 * Root.js CMS managed blocks while preserving custom rules outside the
 * BEGIN/END markers, and records the updated versions on
 * `Projects/{projectId}`.
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
  const databaseId =
    options.database ||
    cmsPluginOptions.firebaseConfig.databaseId ||
    '(default)';

  if (!gcpProjectId) {
    throw new Error('firebaseConfig.projectId not set in cms plugin options');
  }

  console.log(`gcp project: ${gcpProjectId} (database: ${databaseId})`);
  console.log('👮 updating firestore security rules...');
  let result;
  try {
    result = await applySecurityRules(gcpProjectId, {
      force: options.force,
      databaseId,
    });
  } catch (err) {
    if (err instanceof SecurityRulesMergeError) {
      console.error(err.message);
      console.error('Re-run with --force to replace the live ruleset anyway.');
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const db = cmsPlugin.getFirestore({databaseId});
  const rootProjectId = cmsPluginOptions.id || 'default';
  await stampSecurityRulesVersion(db, rootProjectId, {
    firestore: result.version,
  });
  await writeCachedSecurityRulesVersion(
    rootDir,
    gcpProjectId,
    rootProjectId,
    result.version,
    databaseId
  );

  if (result.preservedCustomRules) {
    console.log(
      `✓ updated Firestore security rules to v${result.version} (custom rules preserved)`
    );
  } else {
    console.log(`✓ updated Firestore security rules to v${result.version}`);
  }

  const storageVersion = await updateStorageSecurityRules({
    gcpProjectId,
    bucket: cmsPluginOptions.firebaseConfig.storageBucket,
    databaseId,
    force: options.force,
  });
  if (storageVersion !== null) {
    await stampSecurityRulesVersion(db, rootProjectId, {
      storage: storageVersion,
    });
  }
}

/**
 * Updates the Storage security rules for `bucket` so uploads are authorized
 * against the site roles in the Firestore database `databaseId`. Returns the
 * released rules version, or `null` if the rules were left as-is. Problems are
 * reported without throwing since the Firestore rules are already updated.
 */
export async function updateStorageSecurityRules(options: {
  gcpProjectId: string;
  bucket?: string;
  databaseId: string;
  force?: boolean;
}): Promise<number | null> {
  const {gcpProjectId, bucket, databaseId} = options;
  if (!bucket) {
    return null;
  }
  console.log(`👮 updating storage security rules (gs://${bucket})...`);
  try {
    const result = await applyStorageSecurityRules(gcpProjectId, {
      bucket,
      databaseId,
      force: options.force,
    });
    if (result.status === 'unchanged') {
      console.log(
        `✓ Storage security rules are up to date (v${result.version})`
      );
    } else if (result.preservedCustomRules) {
      console.log(
        `✓ updated Storage security rules to v${result.version} (custom rules preserved)`
      );
    } else {
      console.log(`✓ updated Storage security rules to v${result.version}`);
    }
    return result.version;
  } catch (err: any) {
    process.exitCode = 1;
    if (err instanceof SecurityRulesMergeError) {
      console.error(err.message);
      console.error('Re-run with --force to replace the live ruleset anyway.');
    } else {
      console.error(
        `failed to update Storage security rules: ${err?.message || err}`
      );
    }
    return null;
  }
}
