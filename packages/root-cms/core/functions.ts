import path from 'node:path';
import {loadBundledConfig} from '@blinkk/root/node';
import {ScheduleOptions, onSchedule} from 'firebase-functions/v2/scheduler';
import {runCronJobs} from './cron.js';

export interface CronOptions {
  rootDir?: string;
  scheduleOptions?: Partial<ScheduleOptions>;
}

/**
 * Runs offline CMS tasks, such as publishing of scheduled docs.
 */
export function cron(options?: CronOptions) {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const scheduleOptions: ScheduleOptions = {
    schedule: 'every 1 mins',
    ...options?.scheduleOptions,
  };
  return onSchedule(scheduleOptions, async () => {
    const rootConfig = await loadBundledConfig(rootDir, {command: 'cms-cron'});
    await runCronJobs(rootConfig);
  });
}
