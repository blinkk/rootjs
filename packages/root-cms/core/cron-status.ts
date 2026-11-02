import {RootConfig} from '@blinkk/root';
import {FieldValue, Firestore, Timestamp} from 'firebase-admin/firestore';
import {
  CronJobFailure,
  SEARCH_INDEX_CRON_JOB,
  SEARCH_INDEX_REBUILD_JOB,
} from '../shared/cron-status.js';
import {RootCMSClient, getCmsPlugin} from './client.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;

/**
 * Tracks which background jobs are failing, so that failures can be shown to
 * admins instead of only reaching the server logs. A job's doc exists only
 * while it's failing, and the first failure and the recovery are written to the
 * action log, which also runs the project's `onAction` hooks and notification
 * services.
 *
 * Recording is best-effort: `recordFailure()` and `clearFailure()` never throw,
 * so that a problem here can't change the outcome of the job being tracked.
 */
export class CronStatusService {
  private readonly rootConfig: RootConfig;
  private readonly projectId: string;
  private readonly db: Firestore;

  constructor(rootConfig: RootConfig) {
    const cmsPlugin = getCmsPlugin(rootConfig);
    this.rootConfig = rootConfig;
    this.projectId = cmsPlugin.getConfig().id || 'default';
    this.db = cmsPlugin.getFirestore();
  }

  private collectionPath() {
    return `Projects/${this.projectId}/CronStatus`;
  }

  private docRef(job: string) {
    return this.db.doc(`${this.collectionPath()}/${job}`);
  }

  /** Lists the jobs that are currently failing, most recent first. */
  async listFailures(): Promise<CronJobFailure[]> {
    const snapshot = await this.db.collection(this.collectionPath()).get();
    return snapshot.docs
      .map((doc) => toCronJobFailure(doc.data()))
      .sort((a, b) => b.lastFailedAt - a.lastFailedAt);
  }

  /** Returns the most recent failure of a search index job, if any. */
  async getSearchIndexFailure(): Promise<CronJobFailure | null> {
    const failures = await this.listFailures();
    const jobs = [SEARCH_INDEX_CRON_JOB, SEARCH_INDEX_REBUILD_JOB];
    return failures.find((failure) => jobs.includes(failure.job)) || null;
  }

  /**
   * Records a failed run. An acknowledgement is kept for repeats of the same
   * error, and dropped when the job starts failing in a new way.
   */
  async recordFailure(job: string, err: unknown) {
    try {
      const ref = this.docRef(job);
      const snapshot = await ref.get();
      const previous = snapshot.data();
      const now = Timestamp.now();
      const message = (errorMessage(err) || 'Unknown error').slice(
        0,
        MAX_MESSAGE_LENGTH
      );
      const data: Record<string, unknown> = {
        job,
        message,
        stack: String((err as Error)?.stack || '').slice(0, MAX_STACK_LENGTH),
        failureCount: FieldValue.increment(1),
        firstFailedAt: previous?.firstFailedAt ?? now,
        lastFailedAt: now,
      };
      if (previous && previous.message !== message) {
        data.acknowledgedBy = FieldValue.delete();
        data.acknowledgedAt = FieldValue.delete();
      }
      await ref.set(data, {merge: true});
      if (!previous) {
        await this.logAction('cron.failed', {job, error: message});
      }
    } catch (recordErr) {
      console.error(`failed to record cron failure: ${job}`, recordErr);
    }
  }

  /** Clears a job's failure, if it has one, after a successful run. */
  async clearFailure(job: string) {
    try {
      const ref = this.docRef(job);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return;
      }
      await ref.delete();
      await this.logAction('cron.recovered', {job});
    } catch (err) {
      console.error(`failed to clear cron failure: ${job}`, err);
    }
  }

  /** Marks a failure as seen. It's cleared when the job next succeeds. */
  async acknowledge(job: string, by: string) {
    const ref = this.docRef(job);
    const snapshot = await ref.get();
    if (snapshot.exists) {
      await ref.update({acknowledgedBy: by, acknowledgedAt: Timestamp.now()});
    }
  }

  private async logAction(action: string, metadata: Record<string, string>) {
    const cmsClient = new RootCMSClient(this.rootConfig);
    await cmsClient.logAction(action, {by: 'cron', metadata});
  }
}

function errorMessage(err: unknown): string {
  return String((err as Error)?.message || err || '');
}

/** Converts a `CronStatus` doc to its serializable form. */
function toCronJobFailure(data: any): CronJobFailure {
  const failure: CronJobFailure = {
    job: data.job,
    message: data.message,
    failureCount: data.failureCount || 0,
    firstFailedAt: data.firstFailedAt?.toMillis?.() ?? 0,
    lastFailedAt: data.lastFailedAt?.toMillis?.() ?? 0,
  };
  if (data.stack) {
    failure.stack = data.stack;
  }
  if (data.acknowledgedBy) {
    failure.acknowledgedBy = data.acknowledgedBy;
    failure.acknowledgedAt = data.acknowledgedAt?.toMillis?.();
  }
  return failure;
}
