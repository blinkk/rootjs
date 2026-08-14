/**
 * Isomorphic helpers for the publishing checks feature.
 *
 * Checks are registered globally via `cmsPlugin({checks: [...]})` and opted
 * into per collection via the `publishing.checks` config in a collection's
 * `<id>.schema.ts`. Each collection decides which checks gate publishing and
 * at what severity, so the same check can be `required` in one collection and
 * a `warning` in another.
 *
 * ```ts
 * export default schema.defineCollection({
 *   name: 'Pages',
 *   publishing: {
 *     checks: [
 *       {id: 'root-cms/translations', level: 'required'},
 *       'seo-meta',
 *     ],
 *   },
 *   fields: [...],
 * });
 * ```
 *
 * A `required` check halts publishing when it returns an `error` status. A
 * `warning` check never halts publishing; its message is surfaced to the user
 * after the content goes live.
 */

/**
 * Severity level for a check configured on a collection.
 *
 * - `required`: an `error` result halts publishing.
 * - `warning`: publishing continues, and the message is surfaced afterwards.
 */
export type PublishCheckLevel = 'required' | 'warning';

/** A check configured to run as part of a collection's publishing flow. */
export interface PublishCheckConfig {
  /** ID of a check registered via `cmsPlugin({checks: [...]})`. */
  id: string;
  /** Severity level for the check. Defaults to `required`. */
  level?: PublishCheckLevel;
}

/** Publishing options configured on a collection. */
export interface CollectionPublishingOptions {
  /**
   * Checks to run before docs in this collection are published or scheduled.
   * Accepts either a check ID (which defaults to the `required` level) or a
   * `{id, level}` config object.
   */
  checks?: Array<string | PublishCheckConfig>;
}

/** The result status of a check. */
export type PublishCheckStatus = 'success' | 'warning' | 'error';

/** The result of running a single check against a single doc. */
export interface PublishCheckResult {
  /** The doc the check ran against, e.g. `Pages/index`. */
  docId: string;
  /** ID of the check that produced this result. */
  checkId: string;
  /** Human-readable label for the check. */
  label: string;
  /** The severity level the check was configured with. */
  level: PublishCheckLevel;
  /** Outcome of the check run. */
  status: PublishCheckStatus;
  /** A message describing the result. Supports markdown. */
  message: string;
  /** Optional metadata returned by the check. */
  metadata?: Record<string, any>;
}

/** A summary of a set of check results. */
export interface PublishCheckSummary {
  /**
   * Results that halt publishing, i.e. `error` results from checks configured
   * at the `required` level.
   */
  blocking: PublishCheckResult[];
  /**
   * Results that don't halt publishing but should be surfaced to the user:
   * `warning` results, plus `error` results from `warning`-level checks.
   */
  warnings: PublishCheckResult[];
  /** Results where the check passed. */
  passed: PublishCheckResult[];
}

/**
 * Normalizes a collection's configured checks into a list of
 * `{id, level}` objects. String entries default to the `required` level.
 * Entries without an ID are dropped, and duplicate IDs keep the first entry.
 */
export function normalizePublishChecks(
  checks?: Array<string | PublishCheckConfig>
): Array<Required<PublishCheckConfig>> {
  if (!checks || checks.length === 0) {
    return [];
  }
  const normalized: Array<Required<PublishCheckConfig>> = [];
  const seen = new Set<string>();
  for (const check of checks) {
    const config: PublishCheckConfig =
      typeof check === 'string' ? {id: check} : check || {id: ''};
    const id = String(config.id || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id: id,
      level: config.level === 'warning' ? 'warning' : 'required',
    });
  }
  return normalized;
}

/**
 * Buckets check results into blocking failures, warnings, and passes.
 *
 * Only `error` results from `required` checks block publishing. An `error`
 * from a `warning`-level check is downgraded to a warning so that publishing
 * continues, which keeps the collection's configured level authoritative.
 */
export function summarizePublishChecks(
  results: PublishCheckResult[]
): PublishCheckSummary {
  const summary: PublishCheckSummary = {
    blocking: [],
    warnings: [],
    passed: [],
  };
  for (const result of results) {
    if (result.status === 'success') {
      summary.passed.push(result);
    } else if (result.status === 'error' && result.level === 'required') {
      summary.blocking.push(result);
    } else {
      summary.warnings.push(result);
    }
  }
  return summary;
}
