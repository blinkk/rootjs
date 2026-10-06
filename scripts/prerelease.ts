/**
 * Prepares a prerelease (e.g. `4.0.0-alpha.4`) of the packages in the
 * changesets `fixed` group, for publishing from CI.
 *
 * The next version is derived from npm, the source of truth for what has been
 * published. Given the base version in the packages' `package.json` files
 * (e.g. `4.0.0`), the script finds the highest published `4.0.0-<preid>.N`
 * across all of the packages and uses N + 1, or N = 0 if none exist yet. It
 * then sets that version in each package's `package.json`, along with any peer
 * dependencies on other packages in the group.
 *
 * Usage:
 * ```
 * node scripts/prerelease.ts alpha            # Updates package.json files.
 * node scripts/prerelease.ts alpha --dry-run  # Only prints the version.
 * ```
 *
 * When run in GitHub Actions, `version` and `filters` (the `--filter` args for
 * `pnpm publish`) are written to `$GITHUB_OUTPUT`.
 */

import {appendFile, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  peerDependencies?: Record<string, string>;
}

interface WorkspacePackage {
  path: string;
  json: PackageJson;
}

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

const [preid, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (!preid || !/^[a-z]+$/.test(preid)) {
  console.error('Usage: node scripts/prerelease.ts <preid> [--dry-run]');
  process.exit(1);
}

/** Returns the package names in the changesets `fixed` group. */
async function getFixedPackageNames(): Promise<string[]> {
  const configPath = path.join(ROOT_DIR, '.changeset/config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const names = config.fixed?.[0];
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error(`no "fixed" package group found in ${configPath}`);
  }
  return names;
}

/** Returns the workspace packages in `packages/`, keyed by package name. */
async function getWorkspacePackages(): Promise<Map<string, WorkspacePackage>> {
  const packagesDir = path.join(ROOT_DIR, 'packages');
  const packages = new Map<string, WorkspacePackage>();
  for (const dirName of await readdir(packagesDir)) {
    const packageJsonPath = path.join(packagesDir, dirName, 'package.json');
    try {
      const json = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      packages.set(json.name, {path: packageJsonPath, json});
    } catch {
      // Not a package dir.
    }
  }
  return packages;
}

/** Returns the versions of a package published to npm. */
async function getPublishedVersions(name: string): Promise<string[]> {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}`;
  const res = await fetch(url, {
    headers: {accept: 'application/vnd.npm.install-v1+json'},
  });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`failed to fetch ${url}: ${res.status}`);
  }
  const data = (await res.json()) as {versions?: Record<string, unknown>};
  return Object.keys(data.versions || {});
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const names = await getFixedPackageNames();
  const workspacePackages = await getWorkspacePackages();
  const packages = names.map((name) => {
    const pkg = workspacePackages.get(name);
    if (!pkg) {
      throw new Error(`package ${name} not found in packages/`);
    }
    return pkg;
  });

  // All packages in the fixed group share a version. Strip any prerelease
  // suffix to get the base version, e.g. `4.0.0`.
  const baseVersions = new Set(
    packages.map((pkg) => pkg.json.version.split('-')[0])
  );
  if (baseVersions.size !== 1) {
    throw new Error(
      `packages have different versions: ${Array.from(baseVersions).join(', ')}`
    );
  }
  const baseVersion = Array.from(baseVersions)[0];

  // Find the highest published prerelease number for the base version.
  const prereleaseRegExp = new RegExp(
    `^${escapeRegExp(baseVersion)}-${preid}\\.(\\d+)$`
  );
  let maxNumber = -1;
  for (const name of names) {
    const versions = await getPublishedVersions(name);
    if (versions.includes(baseVersion)) {
      throw new Error(
        `${name}@${baseVersion} is already published; bump the version on ` +
          'main before publishing a prerelease'
      );
    }
    for (const version of versions) {
      const match = version.match(prereleaseRegExp);
      if (match) {
        maxNumber = Math.max(maxNumber, Number(match[1]));
      }
    }
  }
  const version = `${baseVersion}-${preid}.${maxNumber + 1}`;
  console.log(`next ${preid} version: ${version}`);

  if (!dryRun) {
    for (const pkg of packages) {
      pkg.json.version = version;
      // Point peer deps on other packages in the group at the prerelease.
      for (const depName of Object.keys(pkg.json.peerDependencies || {})) {
        if (names.includes(depName)) {
          pkg.json.peerDependencies![depName] = version;
        }
      }
      await writeFile(pkg.path, JSON.stringify(pkg.json, null, 2) + '\n');
      console.log(`updated ${path.relative(ROOT_DIR, pkg.path)}`);
    }
  }

  if (process.env.GITHUB_OUTPUT) {
    const filters = names.map((name) => `--filter=${name}`).join(' ');
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `version=${version}\nfilters=${filters}\n`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
