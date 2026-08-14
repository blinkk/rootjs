import {
  normalizePublishChecks,
  summarizePublishChecks,
  type PublishCheckConfig,
  type PublishCheckResult,
  type PublishCheckSummary,
} from '../../shared/publish-checks.js';

export type {
  PublishCheckLevel,
  PublishCheckResult,
  PublishCheckStatus,
  PublishCheckSummary,
} from '../../shared/publish-checks.js';
export {summarizePublishChecks} from '../../shared/publish-checks.js';

/** A check configured on a collection, resolved against the check registry. */
export interface ResolvedPublishCheck extends Required<PublishCheckConfig> {
  /** Human-readable label from the check registry. */
  label: string;
  /** Optional description from the check registry. */
  description?: string;
}

/**
 * Returns the publishing checks configured on a collection, resolved against
 * the checks registered via `cmsPlugin({checks: [...]})`.
 *
 * Checks that aren't registered, or that are restricted to other collections
 * via the check's own `collections` allowlist, are omitted. This mirrors the
 * server-side behavior in `POST /cms/api/checks.run`.
 */
export function getCollectionPublishChecks(
  collectionId: string
): ResolvedPublishCheck[] {
  const collection = window.__ROOT_CTX.collections?.[collectionId];
  const configuredChecks = normalizePublishChecks(
    collection?.publishing?.checks
  );
  if (configuredChecks.length === 0) {
    return [];
  }
  const registry = window.__ROOT_CTX.checks || [];
  const resolved: ResolvedPublishCheck[] = [];
  for (const configuredCheck of configuredChecks) {
    const registered = registry.find((c) => c.id === configuredCheck.id);
    if (!registered) {
      continue;
    }
    if (
      registered.collections &&
      !registered.collections.includes(collectionId)
    ) {
      continue;
    }
    resolved.push({
      ...configuredCheck,
      label: registered.label,
      description: registered.description,
    });
  }
  return resolved;
}

/**
 * Returns true if any of the given docs belong to a collection with
 * publishing checks configured. Used to skip the server round trip entirely
 * when nothing would run.
 */
export function testHasPublishChecks(docIds: string[]): boolean {
  const collectionIds = new Set(docIds.map((docId) => docId.split('/')[0]));
  for (const collectionId of collectionIds) {
    if (getCollectionPublishChecks(collectionId).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Runs the publishing checks configured on each doc's collection.
 *
 * Returns an empty result set when none of the docs have checks configured.
 */
export async function runPublishChecks(
  docIds: string[]
): Promise<PublishCheckResult[]> {
  if (docIds.length === 0 || !testHasPublishChecks(docIds)) {
    return [];
  }
  const res = await window.fetch('/cms/api/checks.run', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({docIds}),
  });
  const data = await res.json();
  if (!data.success) {
    if (data.error === 'TOO_MANY_DOCS') {
      throw new Error(
        `Publishing checks can only run on ${data.maxDocs} docs at a time. Publish this content in smaller batches, or ask an admin to skip checks.`
      );
    }
    throw new Error(data.error || 'Failed to run publishing checks.');
  }
  return (data.data?.results || []) as PublishCheckResult[];
}

/** Summary metadata about a check run, recorded in the action log. */
export interface PublishChecksAuditMetadata {
  /** Whether an admin chose to skip running checks entirely. */
  skipped?: boolean;
  /** Whether an admin published over failed required checks. */
  bypassed?: boolean;
  /** Number of checks that passed. */
  passed?: number;
  /** Number of results surfaced as warnings. */
  warnings?: number;
  /** IDs of the checks that failed, as `docId::checkId`. */
  failed?: string[];
}

/**
 * Builds the audit metadata recorded alongside a publish action so the action
 * log shows which checks ran and whether they were skipped or bypassed.
 */
export function buildPublishChecksAudit(
  results: PublishCheckResult[],
  options?: {skipped?: boolean; bypassed?: boolean}
): PublishChecksAuditMetadata | null {
  const skipped = options?.skipped || false;
  if (skipped) {
    return {skipped: true};
  }
  if (results.length === 0) {
    return null;
  }
  const summary: PublishCheckSummary = summarizePublishChecks(results);
  const audit: PublishChecksAuditMetadata = {
    passed: summary.passed.length,
    warnings: summary.warnings.length,
  };
  if (summary.blocking.length > 0) {
    audit.failed = summary.blocking.map(
      (result) => `${result.docId}::${result.checkId}`
    );
  }
  if (options?.bypassed) {
    audit.bypassed = true;
  }
  return audit;
}
