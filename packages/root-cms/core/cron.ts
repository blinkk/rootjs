import {RootConfig} from '@blinkk/root';
import {Timestamp} from 'firebase-admin/firestore';
import {
  SEARCH_INDEX_CRON_JOB,
  SEARCH_INDEX_REBUILD_JOB,
} from '../shared/cron-status.js';
import {RootCMSClient} from './client.js';
import {CronStatusService} from './cron-status.js';
import {DependencyGraphService} from './dependency-graph.js';
import {LoadSchemaFn, SearchIndexService} from './search-index.js';
import {VersionsService} from './versions.js';

/**
 * The minimum interval between incremental search-index rebuilds. The cron tick
 * itself runs every 1 min; this throttle prevents a rebuild from kicking off on
 * every tick.
 */
export const SEARCH_INDEX_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The minimum interval between incremental dependency graph updates. Kept
 * short (one cron tick) so that reference changes are reflected in the graph
 * shortly after docs are saved or published.
 */
export const DEPENDENCY_GRAPH_MIN_INTERVAL_MS = 60 * 1000;

export interface RunCronJobsOptions {
  /**
   * Optional schema loader for the search-index rebuild step. The Cloud
   * Scheduler / functions path doesn't need this (prod uses the bundled
   * `dist/collections/<id>.schema.json` files), but the manual
   * `POST /cms/api/cron.run` trigger threads its request-aware loader through
   * so dev users can rebuild without first running a full prod build.
   */
  loadSchema?: LoadSchemaFn;
}

export async function runCronJobs(
  rootConfig: RootConfig,
  options: RunCronJobsOptions = {}
) {
  const cronStatus = new CronStatusService(rootConfig);
  const failingJobs = new Set<string>();
  try {
    const failures = await cronStatus.listFailures();
    failures.forEach((failure) => failingJobs.add(failure.job));
  } catch (err) {
    console.error('failed to read cron status:', err);
  }

  const runCronJob = async (name: string, fn: () => unknown) => {
    try {
      await fn();
      if (failingJobs.has(name)) {
        await cronStatus.clearFailure(name);
      }
    } catch (err) {
      console.log(`cron failed: ${name}`);
      console.error(String(err.stack || err));
      await cronStatus.recordFailure(name, err);
      throw err;
    }
  };

  // Wait for every job to settle, even if one fails, since the process can be
  // suspended once the request is finished.
  const results = await Promise.allSettled([
    runCronJob('publishScheduledDocs', () =>
      runPublishScheduledDocs(rootConfig)
    ),
    runCronJob('syncScheduledDataSources', () =>
      runSyncScheduledDataSources(rootConfig)
    ),
    runCronJob('saveVersions', () => runSaveVersions(rootConfig)),
    runCronJob(SEARCH_INDEX_CRON_JOB, () =>
      runIncrementalSearchIndex(rootConfig, options.loadSchema)
    ),
    runCronJob('updateDependencyGraph', () =>
      runUpdateDependencyGraph(rootConfig)
    ),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }
}

async function runPublishScheduledDocs(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  // Publish scheduled releases even if publishing scheduled docs fails, so a
  // bad scheduled doc doesn't block releases from going out.
  let docsError: unknown;
  try {
    await cmsClient.publishScheduledDocs();
  } catch (err) {
    docsError = err;
  }
  await cmsClient.publishScheduledReleases();
  if (docsError) {
    throw docsError;
  }
}

async function runSyncScheduledDataSources(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  await cmsClient.syncScheduledDataSources();
}

async function runSaveVersions(rootConfig: RootConfig) {
  const service = new VersionsService(rootConfig);
  await service.saveVersions();
}

/**
 * Incrementally updates the dependency graph. No-op when the feature is
 * disabled via `cmsPlugin({dependencyGraph: false})`.
 */
async function runUpdateDependencyGraph(rootConfig: RootConfig) {
  const service = new DependencyGraphService(rootConfig);
  if (!service.isEnabled()) {
    return;
  }
  await service.runCronUpdate({
    minIntervalMs: DEPENDENCY_GRAPH_MIN_INTERVAL_MS,
  });
}

async function runIncrementalSearchIndex(
  rootConfig: RootConfig,
  loadSchema?: LoadSchemaFn
) {
  const service = new SearchIndexService(rootConfig, loadSchema);
  const status = await service.getStatus();
  if (status.lastRun !== null) {
    const elapsed = Date.now() - status.lastRun;
    if (elapsed < SEARCH_INDEX_MIN_INTERVAL_MS) {
      return;
    }
    const hasChanges = await service.hasChangesSince(
      Timestamp.fromMillis(status.lastRun)
    );
    if (!hasChanges) {
      return;
    }
  }
  await service.rebuildIndex({force: false});
  // The index is healthy again, so a failed manual rebuild no longer matters.
  await new CronStatusService(rootConfig).clearFailure(
    SEARCH_INDEX_REBUILD_JOB
  );
}
