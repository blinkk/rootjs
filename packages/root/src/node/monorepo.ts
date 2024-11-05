import path from 'node:path';
import {getWorkspaces, getWorkspaceRoot, PackageInfo} from 'workspace-tools';
import {loadJsonSync} from '../utils/fsutils.js';

interface WorkspacePackage {
  name: string;
  path: string;
  packageJson: PackageInfo;
}

export function loadPackageJson(filepath: string): PackageInfo {
  return loadJsonSync(filepath);
}

/**
 * Returns a map of all packages in the monorepo and the corresponding
 * package.json path.
 */
function getMonorepoPackages(
  rootDir: string
): Record<string, WorkspacePackage> {
  const monorepoRoot = getWorkspaceRoot(rootDir);
  if (!monorepoRoot) {
    return {};
  }

  const workspaces = getWorkspaces(monorepoRoot);
  const packages: Record<string, WorkspacePackage> = {};
  workspaces.forEach((workspaceInfo) => {
    packages[workspaceInfo.name] = workspaceInfo;
  });
  return packages;
}

/**
 * Returns the top-level monorepo package's deps, if any.
 */
export function getMonorepoPackageDeps(
  rootDir: string
): Record<string, string> {
  const monorepoRoot = getWorkspaceRoot(rootDir);
  if (!monorepoRoot) {
    return {};
  }

  const packageJsonPath = path.join(monorepoRoot, 'package.json');
  const packageJson = loadPackageJson(packageJsonPath);
  return packageJson?.dependencies || {};
}

/**
 * Flattens package.json deps from the root project dir, taking into account any
 * deps from the monorepo root as well as any `workspace:` deps from within the
 * monorepo.
 */
export function flattenPackageDepsFromMonorepo(
  rootDir: string,
  options?: {ignore?: Set<string>}
): Record<string, string> {
  const packageJsonPath = path.resolve(rootDir, 'package.json');
  const packageJson = loadPackageJson(packageJsonPath);
  const monorepoDeps = getMonorepoPackageDeps(rootDir);

  // Flatten `peerDependencies` and `dependencies`.
  const projectDeps = {
    ...packageJson.peerDependencies,
    ...packageJson.dependencies,
  };

  const allDeps: Record<string, string> = {};
  const workspacePackages = getMonorepoPackages(rootDir);
  const ignore = options?.ignore || new Set();
  Object.entries(projectDeps).forEach(([depName, depVersion]) => {
    if (
      depName.startsWith('@blinkk/root') &&
      depVersion.startsWith('workspace:')
    ) {
      const packageInfo = workspacePackages[depName];
      if (packageInfo) {
        allDeps[depName] = packageInfo.packageJson.version;
      }
    } else if (depVersion.startsWith('workspace:')) {
      // For internal packages within the workspace, recursively collect the
      // deps from those packages.
      if (ignore.has(depName)) {
        return;
      }
      ignore.add(depName);
      const packageInfo = workspacePackages[depName];
      if (packageInfo) {
        const workspacePackageDir = packageInfo.path;
        const deps = flattenPackageDepsFromMonorepo(workspacePackageDir, {
          ignore: ignore,
        });
        for (const key in deps) {
          const currentValue = allDeps[key];
          if (
            deps[key] &&
            deps[key] !== '*' &&
            (!currentValue || currentValue === '*')
          ) {
            allDeps[key] = deps[key];
          }
        }
      }
    } else if (depVersion === '*' && monorepoDeps[depName]) {
      // For any dependencies using a wildcard version `*`, if the top-level
      // package.json has the depdenency defined, overwrite the version.
      allDeps[depName] = monorepoDeps[depName];
    } else {
      allDeps[depName] = depVersion;
    }
  });
  console.log(`flattened deps for ${rootDir}/package.json:`);
  console.log(allDeps);
  return allDeps;
}
