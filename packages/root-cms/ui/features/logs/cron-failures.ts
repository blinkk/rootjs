import {useEffect, useState} from 'preact/hooks';
import type {CronJobFailure} from '../../../shared/cron-status.js';

/** Minimum time between automatic refreshes, as the user navigates. */
const REFRESH_INTERVAL_MS = 5 * 60_000;

let failures: CronJobFailure[] = [];
let lastRefresh = 0;
const listeners = new Set<(failures: CronJobFailure[]) => void>();

function setFailures(value: CronJobFailure[]) {
  failures = value;
  listeners.forEach((listener) => listener(value));
}

/**
 * Reloads the list of failing background jobs. The endpoint is admin-only, so
 * for everyone else the list stays empty.
 */
export async function refreshCronFailures() {
  lastRefresh = Date.now();
  try {
    const res = await fetch('/cms/api/cron.status');
    if (res.status === 403) {
      return;
    }
    if (!res.ok) {
      throw new Error(`cron.status returned ${res.status}`);
    }
    const data = await res.json();
    setFailures(data.failures || []);
  } catch (err) {
    console.error('failed to load cron status:', err);
  }
}

/** Marks a failure as seen, which hides the alert shown in the top bar. */
export async function acknowledgeCronFailure(job: string) {
  const res = await fetch('/cms/api/cron.acknowledge', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({job}),
  });
  if (!res.ok) {
    throw new Error(`cron.acknowledge returned ${res.status}`);
  }
  await refreshCronFailures();
}

/**
 * Returns the background jobs that are failing. The list is shared by every
 * caller, and is refreshed at most every few minutes because the layout (which
 * calls this) is mounted on every page.
 */
export function useCronFailures(): CronJobFailure[] {
  const [value, setValue] = useState(failures);
  useEffect(() => {
    listeners.add(setValue);
    if (Date.now() - lastRefresh >= REFRESH_INTERVAL_MS) {
      refreshCronFailures();
    } else {
      setValue(failures);
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
