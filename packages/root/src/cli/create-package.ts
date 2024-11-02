import {promises as fs} from 'node:fs';
import path from 'node:path';
import {build as esbuild} from 'esbuild';
import {flattenPackageDepsFromMonorepo} from '../node/monorepo.js';
import {
  copyDir,
  dirExists,
  fileExists,
  loadJson,
  makeDir,
  rmDir,
  writeJson,
} from '../utils/fsutils.js';
import {build as rootBuild} from './build.js';

type DeployTarget = 'appengine' | 'firebase';

interface CreatePackageOptions {
  mode?: string;
  out?: string;
  target?: DeployTarget;
  version?: string;
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
  await rootBuild(rootProjectDir, {ssrOnly: true, mode: mode});

  // Create `outDir` and copy the generated `distDir` files to it.
  await rmDir(outDir);
  await makeDir(outDir);
  await copyDir(distDir, path.resolve(outDir, 'dist'));

  // Copy the "collections" dir if it exists.
  const collectionsDir = path.resolve(rootDir, 'collections');
  if (await dirExists(collectionsDir)) {
    await copyDir(collectionsDir, path.join(outDir, 'collections'));
  }

  // Create package.json.
  const packageJson = await generatePackageJson(rootDir);

  // Set root.js versions.
  if (options?.version && packageJson.dependencies) {
    if (packageJson.dependencies['@blinkk/root']) {
      packageJson.dependencies['@blinkk/root'] = options.version;
    }
    if (packageJson.dependencies['@blinkk/root-cms']) {
      packageJson.dependencies['@blinkk/root-cms'] = options.version;
    }
    if (packageJson.dependencies['@blinkk/root-password-protect']) {
      packageJson.dependencies['@blinkk/root-password-protect'] =
        options.version;
    }
  }

  // Run target-specific updates to the output.
  if (target === 'appengine') {
    await onAppEngine({rootDir, packageJson, outDir});
  } else if (target === 'firebase') {
    await onFirebase({rootDir, packageJson, outDir});
  }

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

  // Flatten any deps from the monorepo, and remove peerDependencies.
  const allDeps = flattenPackageDepsFromMonorepo(rootDir);
  packageJson.dependencies ??= {};
  for (const depName in allDeps) {
    if (!packageJson.dependencies[depName]) {
      packageJson.dependencies[depName] = allDeps[depName];
    }
  }

  if (packageJson.peerDependencies) {
    delete packageJson.peerDependencies;
  }

  return packageJson;
}

/**
 * Called for App Engine targets.
 */
async function onAppEngine(options: {
  rootDir: string;
  packageJson: PackageJson;
  outDir: string;
}) {
  const {rootDir, outDir, packageJson} = options;
  const configPath = path.resolve(rootDir, 'app.yaml');
  if (await fileExists(configPath)) {
    await fs.copyFile(configPath, path.resolve(outDir, 'app.yaml'));
  }

  // Only include the "start" script.
  if (packageJson.scripts?.start) {
    packageJson.scripts = {start: packageJson.scripts.start};
  } else {
    packageJson.scripts = {start: 'root start --host=0.0.0.0'};
  }
}

/**
 * Called for Firebase Hosting targets.
 */
async function onFirebase(options: {
  rootDir: string;
  packageJson: PackageJson;
  outDir: string;
}) {
  const {rootDir, outDir, packageJson} = options;

  // If the outDir is called `functions/` and an index.ts file exists in the
  // root project dir, automatically compile it through esbuild.
  const outBasename = path.basename(outDir);
  if (outBasename === 'functions') {
    const indexTsFile = path.resolve(rootDir, 'index.ts');
    if (await fileExists(indexTsFile)) {
      await bundleTsFile(indexTsFile, path.resolve(outDir, 'index.js'));
    }
  }

  // Only include the "start" script.
  if (packageJson.scripts?.start) {
    packageJson.scripts = {start: packageJson.scripts.start};
  } else {
    packageJson.scripts = {start: 'root start --host=0.0.0.0'};
  }
}

/**
 * Compiles a `.ts` file to `.js`.
 */
export async function bundleTsFile(srcPath: string, outPath: string) {
  await esbuild({
    entryPoints: [srcPath],
    bundle: true,
    minify: true,
    platform: 'node',
    outfile: outPath,
    sourcemap: 'inline',
    metafile: true,
    format: 'esm',
    plugins: [
      {
        name: 'externalize-deps',
        setup(build: any) {
          build.onResolve({filter: /.*/}, (args: any) => {
            const id = args.path;
            if (id[0] !== '.' && !path.isAbsolute(id)) {
              return {
                external: true,
              };
            }
            return null;
          });
        },
      },
    ],
  });
}
