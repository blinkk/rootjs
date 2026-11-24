import {promises as fs} from 'node:fs';
import path from 'node:path';
import {getApps, initializeApp} from 'firebase-admin/app';
import {Firestore} from 'firebase-admin/firestore';
import {getSecurityRules} from 'firebase-admin/security-rules';
import {
  FIRESTORE_RULES,
  FIRESTORE_RULES_MANAGED_BLOCK,
  FIRESTORE_RULES_VERSION,
  MergeFirestoreRulesResult,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
  STORAGE_RULES,
  STORAGE_RULES_VERSION,
  SecurityRulesVersionDoc,
  hasRootCmsRulesMarkers,
  mergeFirestoreRules,
  parseRulesVersion,
} from '../shared/security-rules.js';

export {
  FIRESTORE_RULES,
  FIRESTORE_RULES_MANAGED_BLOCK,
  FIRESTORE_RULES_VERSION,
  ROOT_CMS_RULES_END,
  ROOT_CMS_RULES_START,
  STORAGE_RULES,
  STORAGE_RULES_VERSION,
  hasRootCmsRulesMarkers,
  mergeFirestoreRules,
  parseRulesVersion,
};
export type {MergeFirestoreRulesResult, SecurityRulesVersionDoc};

/** Error thrown when live rules have custom sections without START/END markers. */
export class SecurityRulesMergeError extends Error {
  readonly code = 'NEEDS_MANUAL_MERGE';
  constructor(message: string) {
    super(message);
    this.name = 'SecurityRulesMergeError';
  }
}

/** Status of the project's deployed Firestore security rules. */
export interface SecurityRulesStatus {
  /** Whether the deployed rules are current, outdated, or could not be checked. */
  status: 'up_to_date' | 'outdated' | 'unavailable';
  /** Version parsed from the live rules, or `null` if unversioned/unknown. */
  deployedVersion: number | null;
  /** Latest Root.js CMS Firestore rules version bundled with this package. */
  latestVersion: number;
  /** Whether the live rules contain `// [START root-cms]`..`// [END root-cms]`. */
  hasMarkers: boolean;
  /** Whether the rules can be updated automatically without clobbering custom rules. */
  canAutoMerge: boolean;
  /** GCP project id whose rules were checked. */
  gcpProjectId: string;
  /** Reason if `status === 'unavailable'` or `!canAutoMerge`. */
  reason?: string;
}

/** Result returned by {@link applySecurityRules}. */
export interface ApplySecurityRulesResult {
  version: number;
  previousVersion: number | null;
  preservedCustomRules: boolean;
  status: MergeFirestoreRulesResult['status'] | 'forced';
}

const RULES_STATUS_CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedRulesStatus {
  checkedAt: number;
  value: SecurityRulesStatus;
}

const RULES_STATUS_CACHE = new Map<string, CachedRulesStatus>();

function getSecurityRulesApp(projectId: string) {
  const name = `root-cms-security-rules-${projectId}`;
  return (
    getApps().find((app) => app.name === name) ||
    getApps().find((app) => app.options.projectId === projectId) ||
    initializeApp({projectId}, name)
  );
}

/**
 * Fetches the currently released Firestore security rules source for
 * `projectId`, or returns `null` if no ruleset has been released yet.
 */
export async function getLiveFirestoreRulesSource(
  projectId: string
): Promise<string | null> {
  const app = getSecurityRulesApp(projectId);
  const securityRules = getSecurityRules(app);
  try {
    const ruleset = await securityRules.getFirestoreRuleset();
    const files = ruleset.source?.files || [];
    if (files.length === 0) {
      return null;
    }
    return files.map((f) => f.content).join('\n');
  } catch (err: any) {
    const code = String(err?.code || err?.errorInfo?.code || '');
    if (code.includes('not-found')) {
      return null;
    }
    throw err;
  }
}

/**
 * Updates the project's Firestore security rules to the latest Root.js CMS
 * rules. If the live rules contain `// [START root-cms]` .. `// [END root-cms]`
 * markers, only the managed block is replaced and custom rules outside it are
 * preserved. Throws {@link SecurityRulesMergeError} if custom rules are
 * detected without markers unless `options.force` is true.
 */
export async function applySecurityRules(
  projectId: string,
  options?: {force?: boolean}
): Promise<ApplySecurityRulesResult> {
  const app = getSecurityRulesApp(projectId);
  const securityRules = getSecurityRules(app);
  const currentSource = await getLiveFirestoreRulesSource(projectId);
  const mergeResult = mergeFirestoreRules(currentSource);

  let nextSource: string;
  let resultStatus: ApplySecurityRulesResult['status'] = mergeResult.status;
  if (mergeResult.merged !== null) {
    nextSource = mergeResult.merged;
  } else if (options?.force) {
    nextSource = FIRESTORE_RULES;
    resultStatus = 'forced';
  } else {
    throw new SecurityRulesMergeError(
      mergeResult.reason ||
        'Existing Firestore rules contain custom rules without Root.js CMS markers.'
    );
  }

  await securityRules.releaseFirestoreRulesetFromSource(nextSource);
  RULES_STATUS_CACHE.delete(projectId);

  return {
    version: FIRESTORE_RULES_VERSION,
    previousVersion: mergeResult.previousVersion,
    preservedCustomRules: mergeResult.preservedCustomRules,
    status: resultStatus,
  };
}

/**
 * Records the deployed security rules version on `Projects/{rootProjectId}` so
 * the CMS UI can check it without making extra Firestore or Rules API calls.
 */
export async function stampSecurityRulesVersion(
  db: Firestore,
  rootProjectId: string,
  version: SecurityRulesVersionDoc
): Promise<void> {
  const docRef = db.doc(`Projects/${encodeURIComponent(rootProjectId)}`);
  await docRef.set({securityRulesVersion: version}, {merge: true});
}

/**
 * Checks whether the project's live Firestore security rules are up to date,
 * caching the result in memory for 1 hour to avoid repeated API calls.
 */
export async function getSecurityRulesStatus(options: {
  gcpProjectId: string;
  db?: Firestore;
  rootProjectId?: string;
  forceRefresh?: boolean;
}): Promise<SecurityRulesStatus> {
  const {gcpProjectId, db, rootProjectId, forceRefresh} = options;
  const cached = RULES_STATUS_CACHE.get(gcpProjectId);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.checkedAt < RULES_STATUS_CACHE_TTL_MS
  ) {
    return cached.value;
  }

  let liveSource: string | null;
  try {
    liveSource = await getLiveFirestoreRulesSource(gcpProjectId);
  } catch (err: any) {
    const result: SecurityRulesStatus = {
      status: 'unavailable',
      deployedVersion: null,
      latestVersion: FIRESTORE_RULES_VERSION,
      hasMarkers: false,
      canAutoMerge: false,
      gcpProjectId,
      reason:
        err?.message ||
        'Server credentials do not have permission to read Firebase Security Rules.',
    };
    RULES_STATUS_CACHE.set(gcpProjectId, {
      checkedAt: Date.now(),
      value: result,
    });
    return result;
  }

  const deployedVersion = parseRulesVersion(liveSource);
  const hasMarkers = hasRootCmsRulesMarkers(liveSource);
  const mergeResult = mergeFirestoreRules(liveSource);
  const isUpToDate =
    deployedVersion !== null && deployedVersion >= FIRESTORE_RULES_VERSION;

  if (isUpToDate && db && rootProjectId) {
    try {
      await stampSecurityRulesVersion(db, rootProjectId, {
        firestore: deployedVersion,
      });
    } catch (err) {
      console.warn('failed to stamp securityRulesVersion:', err);
    }
  }

  const result: SecurityRulesStatus = {
    status: isUpToDate ? 'up_to_date' : 'outdated',
    deployedVersion,
    latestVersion: FIRESTORE_RULES_VERSION,
    hasMarkers,
    canAutoMerge: mergeResult.merged !== null,
    gcpProjectId,
    ...(mergeResult.reason ? {reason: mergeResult.reason} : {}),
  };
  RULES_STATUS_CACHE.set(gcpProjectId, {checkedAt: Date.now(), value: result});
  return result;
}

function getSecurityRulesCachePath(rootDir: string): string {
  return path.join(
    rootDir,
    'node_modules',
    '.cache',
    'root-cms',
    'security-rules.json'
  );
}

/**
 * Reads the locally cached Firestore security rules version for a project
 * from `node_modules/.cache/root-cms/security-rules.json`, or returns `null`
 * if not cached.
 */
export async function readCachedSecurityRulesVersion(
  rootDir: string,
  gcpProjectId: string,
  rootProjectId: string
): Promise<number | null> {
  try {
    const raw = await fs.readFile(getSecurityRulesCachePath(rootDir), 'utf8');
    const data = JSON.parse(raw) as Record<string, {firestore?: number}>;
    const version = data?.[`${gcpProjectId}/${rootProjectId}`]?.firestore;
    return typeof version === 'number' ? version : null;
  } catch {
    return null;
  }
}

/**
 * Persists the verified Firestore security rules version to
 * `node_modules/.cache/root-cms/security-rules.json` so subsequent dev server
 * startups can skip Firestore and Firebase Rules API checks until
 * `FIRESTORE_RULES_VERSION` increases.
 */
export async function writeCachedSecurityRulesVersion(
  rootDir: string,
  gcpProjectId: string,
  rootProjectId: string,
  firestoreVersion: number
): Promise<void> {
  const filePath = getSecurityRulesCachePath(rootDir);
  let data: Record<string, {firestore?: number}> = {};
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      data = parsed;
    }
  } catch {
    // Cache file doesn't exist yet or is invalid; start fresh.
  }
  data[`${gcpProjectId}/${rootProjectId}`] = {firestore: firestoreVersion};
  try {
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  } catch {
    // Non-fatal if cache directory isn't writable.
  }
}
