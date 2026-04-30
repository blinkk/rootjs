import {RootConfig} from '@blinkk/root';
import {Timestamp} from 'firebase-admin/firestore';
import {RootCMSClient} from './client.js';
import {SearchIndexService} from './search-index.js';
import {VersionsService} from './versions.js';

/**
 * The minimum interval between incremental search-index rebuilds. The cron tick
 * itself runs every 1 min; this throttle prevents a rebuild from kicking off on
 * every tick.
 */
export const SEARCH_INDEX_MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function runCronJobs(rootConfig: RootConfig) {
  await Promise.all([
    runCronJob('publishScheduledDocs', runPublishScheduledDocs, rootConfig),
    runCronJob(
      'syncScheduledDataSources',
      runSyncScheduledDataSources,
      rootConfig
    ),
    runCronJob('saveVersions', runSaveVersions, rootConfig),
    runCronJob('incrementalSearchIndex', runIncrementalSearchIndex, rootConfig),
  ]);
}

async function runCronJob(
  name: string,
  fn: (...args: any[]) => any,
  ...args: any[]
) {
  try {
    await fn(...args);
  } catch (err) {
    console.log(`cron failed: ${name}`);
    console.error(String(err.stack || err));
    throw err;
  }
}

async function runPublishScheduledDocs(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  await cmsClient.publishScheduledDocs();
  await cmsClient.publishScheduledReleases();
}

async function runSyncScheduledDataSources(rootConfig: RootConfig) {
  const cmsClient = new RootCMSClient(rootConfig);
  await cmsClient.syncScheduledDataSources();
}

async function runSaveVersions(rootConfig: RootConfig) {
  const service = new VersionsService(rootConfig);
  await service.saveVersions();
}

async function runIncrementalSearchIndex(rootConfig: RootConfig) {
  const service = new SearchIndexService(rootConfig);
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
}
