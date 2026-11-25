import path from 'node:path';
import {
  getWorkspaceInfos,
  getWorkspaceManagerRoot,
  PackageInfo,
} from 'workspace-tools';
import {fileExistsSync, loadJsonSync} from '../utils/fsutils.js';

interface WorkspacePackage {
  name: string;
  path: string;
  packageJson: PackageInfo;
}

export function loadPackageJson(filepath: string): PackageInfo | null {
  if (!fileExistsSync(filepath)) {
    return null;
  }
  return loadJsonSync(filepath);
}

/**
 * Returns a map of all packages in the monorepo and the corresponding
 * package.json path.
 */
function getMonorepoPackages(
  rootDir: string,
  monorepoRoot?: string
): Record<string, WorkspacePackage> {
  const workspaceRoot = monorepoRoot ?? getWorkspaceManagerRoot(rootDir);
  if (!workspaceRoot) {
    return {};
  }

  const workspaces = getWorkspaceInfos(workspaceRoot) || [];
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
  rootDir: string,
  monorepoRoot?: string
): Record<string, string> {
  const workspaceRoot = monorepoRoot ?? getWorkspaceManagerRoot(rootDir);
  if (!workspaceRoot) {
    return {};
  }

  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  const packageJson = loadPackageJson(packageJsonPath);
  return packageJson?.dependencies || {};
}

export interface FlattenPackageDepsOptions {
  /** Workspace package names already visited during recursion. */
  ignore?: Set<string>;
  /** Cached top-level monorepo dependencies. */
  monorepoDeps?: Record<string, string>;
  /** Cached map of monorepo workspace packages. */
  workspacePackages?: Record<string, WorkspacePackage>;
}

/**
 * Flattens package.json deps from the root project dir, taking into account any
 * deps from the monorepo root as well as any `workspace:` deps from within the
 * monorepo.
 */
export function flattenPackageDepsFromMonorepo(
  rootDir: string,
  options?: FlattenPackageDepsOptions
): Record<string, string> {
  const packageJsonPath = path.resolve(rootDir, 'package.json');
  const packageJson = loadPackageJson(packageJsonPath);

  // Resolve the monorepo root once at the top-level call so recursive calls
  // reuse `monorepoDeps` and `workspacePackages` without re-scanning the
  // workspace.
  let monorepoRoot: string | undefined;
  const resolveMonorepoRoot = () => {
    if (monorepoRoot === undefined) {
      monorepoRoot = getWorkspaceManagerRoot(rootDir) || '';
    }
    return monorepoRoot;
  };
  const monorepoDeps =
    options?.monorepoDeps ??
    getMonorepoPackageDeps(rootDir, resolveMonorepoRoot());

  // Flatten `peerDependencies` and `dependencies`.
  const projectDeps = {
    ...packageJson?.peerDependencies,
    ...packageJson?.dependencies,
  };

  const allDeps: Record<string, string> = {};
  let workspacePackages = options?.workspacePackages;
  const getWorkspacePackages = () => {
    if (!workspacePackages) {
      workspacePackages = getMonorepoPackages(rootDir, resolveMonorepoRoot());
    }
    return workspacePackages;
  };
  const ignore = options?.ignore || new Set();
  Object.entries(projectDeps).forEach(([depName, depVersion]) => {
    if (
      depName.startsWith('@blinkk/root') &&
      depVersion.startsWith('workspace:')
    ) {
      const packageInfo = getWorkspacePackages()[depName];
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
      const packages = getWorkspacePackages();
      const packageInfo = packages[depName];
      if (packageInfo) {
        const workspacePackageDir = packageInfo.path;
        const deps = flattenPackageDepsFromMonorepo(workspacePackageDir, {
          ignore: ignore,
          monorepoDeps: monorepoDeps,
          workspacePackages: packages,
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
  return sortDeps(allDeps);
}

function sortDeps(deps: Record<string, string>): Record<string, string> {
  const keys = Object.keys(deps).sort();
  const sortedDeps: Record<string, string> = {};
  for (const key of keys) {
    sortedDeps[key] = deps[key];
  }
  return sortedDeps;
}
