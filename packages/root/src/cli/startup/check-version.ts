import {cyan, dim, green, yellow} from 'kleur/colors';

import type {StartupTask} from './startup-tasks.js';

const PACKAGE_NAME = '@blinkk/root';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REGISTRY_TIMEOUT_MS = 3000;

/**
 * Startup task that checks whether a newer version of `@blinkk/root` has been
 * published to npm and, if so, prints an update notice. Throttled to run at
 * most once per day.
 */
export const checkVersionTask: StartupTask = {
  name: 'check-version',
  throttle: ONE_DAY_MS,
  // Skip the check when disabled via env var, when the version is unknown, or
  // for pre-release (alpha/beta/rc) builds that are intentionally ahead of the
  // latest stable release.
  enabled(ctx) {
    return (
      !isVersionCheckDisabled() && !!ctx.version && !isPrerelease(ctx.version)
    );
  },
  async run(ctx) {
    const current = ctx.version;
    const latest = await fetchLatestVersion();
    if (current && latest && isNewerVersion(current, latest)) {
      printUpdateNotice(current, latest);
    }
  },
};

/**
 * Whether the version check has been disabled via environment variable. Honors
 * the `@blinkk/root`-specific `ROOT_DISABLE_VERSION_CHECK` as well as the de
 * facto `NO_UPDATE_NOTIFIER` convention. Either can be set in the shell or in a
 * project's `.env` file, which the CLI loads on startup.
 */
function isVersionCheckDisabled(): boolean {
  return (
    isEnvEnabled('ROOT_DISABLE_VERSION_CHECK') ||
    isEnvEnabled('NO_UPDATE_NOTIFIER')
  );
}

function isEnvEnabled(name: string): boolean {
  const value = (process.env[name] || '').trim().toLowerCase();
  return value !== '' && value !== '0' && value !== 'false';
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
  try {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
    const res = await fetch(url, {signal: controller.signal});
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {version?: string};
    return data.version || null;
  } catch {
    // Network error, timeout, or invalid response; skip the check.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns true if `latest` is a higher semantic version than `current`.
 * Pre-release identifiers are ignored.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) {
      return true;
    }
    if (a[i] < b[i]) {
      return false;
    }
  }
  return false;
}

/**
 * Returns true if `version` is an alpha, beta, or rc pre-release build, e.g.
 * `3.1.0-rc.1`.
 */
export function isPrerelease(version: string): boolean {
  return /-(alpha|beta|rc)\b/i.test(version);
}

function parseVersion(version: string): [number, number, number] {
  const main = version.split('-')[0];
  const parts = main.split('.');
  const toInt = (value: string | undefined) => {
    const num = parseInt(value || '0', 10);
    return isNaN(num) ? 0 : num;
  };
  return [toInt(parts[0]), toInt(parts[1]), toInt(parts[2])];
}

function printUpdateNotice(current: string, latest: string) {
  const bar = dim('┃');
  const cmd = cyan(`npm i ${PACKAGE_NAME}@latest`);
  console.log();
  console.log(
    `${bar} ${yellow('Update available:')} ${dim(current)} → ${green(latest)}`
  );
  console.log(`${bar} Run ${cmd} to update.`);
  console.log();
}
