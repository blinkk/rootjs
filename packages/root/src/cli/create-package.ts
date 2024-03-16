import path from 'node:path';
import {loadRootConfig} from '../node/load-config';
import {
  copyDir,
  fileExists,
  loadJson,
  makeDir,
  rmDir,
  writeJson,
} from '../utils/fsutils';
import {build} from './build';

type DeployTarget = 'appengine' | 'firebase';

interface CreatePackageOptions {
  mode?: string;
  out?: string;
  target?: DeployTarget;
}

interface PeerDependencyMeta {
  optional?: boolean;
}

interface PackageJson {
  [key: string]: any;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, PeerDependencyMeta>;
  workspaces?: string[];
}

export async function createPackage(
  rootProjectDir?: string,
  options?: CreatePackageOptions
) {
  const mode = options?.mode || 'production';
  process.env.NODE_ENV = mode;

  const rootDir = path.resolve(rootProjectDir || process.cwd());
  // const rootConfig = await loadRootConfig(rootDir, {command: 'build'});
  const distDir = path.join(rootDir, 'dist');
  const target = options?.target || (await getDefaultTarget(rootDir));
  const outDir = path.resolve(options?.out || target || 'out');

  // Build the site in ssr-only mode.
  await build(rootProjectDir, {ssrOnly: true, mode: mode});

  // Create `outDir` and copy the generated `distDir` files to it.
  await rmDir(outDir);
  await makeDir(outDir);
  await copyDir(distDir, path.resolve(outDir, 'dist'));

  // Create package.json.
  const packageJson = await generatePackageJson(rootDir);

  // TODO(stevenle): update files specific to the deploy target.

  // if (target === 'appengine') {
  // } else if (target === 'firebase') {
  // }

  // Save `outDir/package.json`.
  await writeJson(path.resolve(outDir, 'package.json'), packageJson);

  console.log('done!');
  console.log(`saved package to ${outDir}`);
}

async function getDefaultTarget(rootDir: string): Promise<DeployTarget | null> {
  // Default to firebase if a firebase.json file exists in the root dir.
  const firebaseConfigPath = path.resolve(rootDir, 'firebase.json');
  if (await fileExists(firebaseConfigPath)) {
    return 'firebase';
  }

  // Default to appengine.
  const appEngineConfigPath = path.resolve(rootDir, 'app.yaml');
  if (await fileExists(appEngineConfigPath)) {
    return 'appengine';
  }

  return null;
}

async function generatePackageJson(rootDir: string): Promise<PackageJson> {
  // Read the package.json.
  const packageJson = await loadJson<any>(
    path.resolve(rootDir, 'package.json')
  );

  // If the package.json has any peer deps, check the workspace root for any
  // matching versions and move the peer deps to prod deps.
  if (packageJson.peerDependencies) {
    await updatePeerDepsFromWorkspace(rootDir, packageJson);
  }

  return packageJson;
}

async function updatePeerDepsFromWorkspace(
  rootDir: string,
  packageJson: PackageJson
) {
  const requiredPeerDeps = getRequiredPeerDeps(packageJson);
  if (requiredPeerDeps.length === 0) {
    return;
  }

  const workspaceRoot = await findWorkspaceRoot(rootDir);
  if (!workspaceRoot) {
    return;
  }

  const workspacePackageJsonPath = path.resolve(workspaceRoot, 'package.json');
  const workspacePackageJson = await loadJson<PackageJson>(
    workspacePackageJsonPath
  );
  const workspaceDeps = workspacePackageJson.dependencies || {};

  function setDep(name: string, value: string) {
    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }
    packageJson.dependencies[name] = value;
  }

  for (const peerDep of requiredPeerDeps) {
    const workspaceDepVersion = workspaceDeps[peerDep];
    if (workspaceDepVersion) {
      setDep(peerDep, workspaceDepVersion);
    } else {
      console.warn(
        `could not find peer dep "${peerDep}" in workspace "${workspacePackageJsonPath}"`
      );
    }
  }
}

async function findWorkspaceRoot(rootDir: string): Promise<string | null> {
  const parentDir = path.dirname(rootDir);

  if (parentDir === '/') {
    return null;
  }

  // PNPM uses `pnpm-workspace.yaml` for its workspace root.
  const pnpmWorkspaceFile = path.resolve(parentDir, 'pnpm-workspace.yaml');
  if (await fileExists(pnpmWorkspaceFile)) {
    return parentDir;
  }

  // YARN uses the "workspaces" key in package.json.
  const packageJsonPath = path.resolve(parentDir, 'package.json');
  if (await fileExists(packageJsonPath)) {
    const parentPackageJson = await loadJson<PackageJson>(packageJsonPath);
    if (parentPackageJson && parentPackageJson.workspaces) {
      return parentDir;
    }
  }

  return findWorkspaceRoot(parentDir);
}

/**
 * Returns all the `peerDependencies` that are not marked as
 * `{"optional": true}` in `peerDependenciesMeta`.
 */
function getRequiredPeerDeps(packageJson: PackageJson) {
  const requiredPeerDeps: string[] = [];
  const peerDeps = packageJson.peerDependencies || {};
  const peerDepsMeta = packageJson.peerDependenciesMeta || {};
  for (const key in peerDeps) {
    const meta = peerDepsMeta[key];
    if (!meta?.optional) {
      requiredPeerDeps.push(key);
    }
  }
  return requiredPeerDeps;
}
