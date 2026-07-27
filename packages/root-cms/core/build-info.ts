import {promises as fs} from 'node:fs';
import path from 'node:path';

/**
 * Path of the build metadata file, relative to the project's `dist` dir. The
 * file is written by the CMS plugin's `postBuild` hook and read back by the
 * prod server, so it needs to be part of the deployed build output.
 */
const BUILD_INFO_PATH = '.root-cms/build.json';

export interface BuildInfo {
  /** Epoch millis for when `root build` finished. */
  timestamp: number;
}

function getBuildInfoFilePath(rootDir: string): string {
  return path.join(rootDir, 'dist', BUILD_INFO_PATH);
}

/**
 * Saves build metadata to `dist/.root-cms/build.json`. Called from the CMS
 * plugin's `postBuild` hook so that prebuilt servers can report when they
 * were built.
 */
export async function writeBuildInfo(
  rootDir: string,
  options?: {timestamp?: number}
): Promise<BuildInfo> {
  const buildInfo: BuildInfo = {
    timestamp: options?.timestamp ?? new Date().getTime(),
  };
  const filePath = getBuildInfoFilePath(rootDir);
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(filePath, JSON.stringify(buildInfo, null, 2), 'utf-8');
  return buildInfo;
}

const buildInfoCache = new Map<string, Promise<BuildInfo | null>>();

/**
 * Returns the build metadata saved by `root build`, or `null` when the app
 * isn't prebuilt (e.g. the dev server) or the file is missing (e.g. the app
 * was built by an older version of Root CMS). The result is cached for the
 * lifetime of the server process.
 */
export function getBuildInfo(rootDir: string): Promise<BuildInfo | null> {
  // The dev server serves from source, so any `dist/` files lying around are
  // from an unrelated build and shouldn't be reported.
  if (process.env.NODE_ENV === 'development') {
    return Promise.resolve(null);
  }
  let buildInfo = buildInfoCache.get(rootDir);
  if (!buildInfo) {
    buildInfo = readBuildInfo(rootDir);
    buildInfoCache.set(rootDir, buildInfo);
  }
  return buildInfo;
}

async function readBuildInfo(rootDir: string): Promise<BuildInfo | null> {
  try {
    const data = await fs.readFile(getBuildInfoFilePath(rootDir), 'utf-8');
    const timestamp = Number(JSON.parse(data)?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null;
    }
    return {timestamp};
  } catch {
    return null;
  }
}

/** Clears the in-memory cache used by `getBuildInfo()`. Used by tests. */
export function clearBuildInfoCache() {
  buildInfoCache.clear();
}
