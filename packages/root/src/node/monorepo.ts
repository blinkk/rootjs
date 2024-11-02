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
    if (workspaceInfo.packageJson?.private) {
      return;
    }
    packages[workspaceInfo.name] = workspaceInfo;
  });
  return packages;
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
  const projectDeps = {
    ...packageJson.peerDependencies,
    ...packageJson.dependencies,
  };
  const allDeps: Record<string, string> = {};
  const workspacePackages = getMonorepoPackages(rootDir);
  const ignore = options?.ignore || new Set();
  Object.entries(projectDeps).forEach(([depName, depVersion]) => {
    // For internal packages within the workspace, recursively collect the deps
    // from those packages.
    if (depVersion.startsWith('workspace:')) {
      // Avoid circular deps.
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
          allDeps[key] ??= deps[key];
        }
      }
    } else {
      allDeps[depName] = depVersion;
    }
  });
  return allDeps;
}
