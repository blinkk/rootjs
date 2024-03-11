import {RootConfig} from '@blinkk/root';
import {RootCMSClient} from './client.js';
import {VersionsService} from './versions.js';

export async function runCronJobs(rootConfig: RootConfig) {
  await Promise.all([
    runCronJob('publishScheduledDocs', runPublishScheduledDocs, rootConfig),
    runCronJob('saveVersions', runSaveVersions, rootConfig),
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

async function runSaveVersions(rootConfig: RootConfig) {
  const service = new VersionsService(rootConfig);
  await service.saveVersions();
}
