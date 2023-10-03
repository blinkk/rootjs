import {RootConfig} from '@blinkk/root';
import {publishScheduledDocs} from './runtime.js';
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
  await publishScheduledDocs(rootConfig);
}

async function runSaveVersions(rootConfig: RootConfig) {
  const service = new VersionsService(rootConfig);
  await service.saveVersions();
}
