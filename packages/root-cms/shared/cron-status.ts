/**
 * Shared types for background job failures, which are stored in
 * `Projects/{projectId}/CronStatus/{job}` for as long as a job is failing.
 */

/** The manual search index rebuild, which runs outside of the cron. */
export const SEARCH_INDEX_REBUILD_JOB = 'searchIndexRebuild';

/** The cron's incremental search index update. */
export const SEARCH_INDEX_CRON_JOB = 'incrementalSearchIndex';

/** User-facing names of the background jobs. */
export const CRON_JOB_LABELS: Record<string, string> = {
  publishScheduledDocs: 'Scheduled publishing',
  syncScheduledDataSources: 'Scheduled data source sync',
  saveVersions: 'Version history',
  [SEARCH_INDEX_CRON_JOB]: 'Search index update',
  [SEARCH_INDEX_REBUILD_JOB]: 'Search index rebuild',
  updateDependencyGraph: 'Dependency graph update',
};

/** A background job that's currently failing. */
export interface CronJobFailure {
  /** The job's id, e.g. `incrementalSearchIndex`. */
  job: string;
  /** The most recent error message. */
  message: string;
  /** The most recent stack trace. */
  stack?: string;
  /** Number of failures in a row. */
  failureCount: number;
  /** Epoch millis of the first failure in a row. */
  firstFailedAt: number;
  /** Epoch millis of the most recent failure. */
  lastFailedAt: number;
  /** Email of the admin who acknowledged the failure. */
  acknowledgedBy?: string;
  /** Epoch millis of when the failure was acknowledged. */
  acknowledgedAt?: number;
}
