import {loadRootConfig} from '@blinkk/root/node';
import {Firestore} from 'firebase-admin/firestore';
import {getCmsPlugin} from '../core/client.js';
import {
  applySecurityRules,
  SecurityRulesMergeError,
  stampSecurityRulesVersion,
  writeCachedSecurityRulesVersion,
} from '../core/security.js';

export interface InitFirebaseOptions {
  /** GCP project id. */
  project?: string;
  /** Adds an ADMIN to the security rules. */
  admin?: string;
  /** Overwrites live rules even when custom rules lack START/END markers. */
  force?: boolean;
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

  if (result.preservedCustomRules) {
    console.log(
      `✓ updated Root.js CMS security rules to v${result.version} (custom rules preserved)`
    );
  } else {
    console.log(`✓ updated Root.js CMS security rules to v${result.version}`);
  }

  const db = cmsPlugin.getFirestore();
  const rootProjectId = cmsPluginOptions.id || 'default';
  await stampSecurityRulesVersion(db, rootProjectId, {
    firestore: result.version,
  });
  await writeCachedSecurityRulesVersion(
    rootDir,
    gcpProjectId,
    rootProjectId,
    result.version
  );

  if (options.admin) {
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
