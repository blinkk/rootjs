import path from 'node:path';
import {bundleRequire} from 'bundle-require';
import {build} from 'esbuild';
import {RootConfig} from '../core/config';
import {fileExists, loadJson} from '../utils/fsutils';

export interface ConfigOptions {
  command: string;
}

export async function loadRootConfig(
  rootDir: string,
  options: ConfigOptions
): Promise<RootConfig> {
  const configPath = path.resolve(rootDir, 'root.config.ts');
  const exists = await fileExists(configPath);
  if (!exists) {
    throw new Error(`${configPath} does not exist`);
  }
  const configBundle = await bundleRequire({
    filepath: configPath,
  });
  let config = configBundle.mod.default || {};
  if (typeof config === 'function') {
    config = (await config(options)) || {};
  }
  return Object.assign({}, config, {rootDir});
}

/**
 * Compiles a root.config.ts file to root.config.js.
 */
export async function bundleRootConfig(rootDir: string, outPath: string) {
  const configPath = path.resolve(rootDir, 'root.config.ts');
  const configExists = await fileExists(configPath);
  if (!configExists) {
    throw new Error(`${configPath} does not exist`);
  }

  const packageJsonPath = path.resolve(rootDir, 'package.json');
  const packageJson = await loadPackageJson(packageJsonPath);
  const allDeps = {
    ...packageJson.peerDependencies,
    ...packageJson.dependencies,
  };

  function getPackageName(id: string): string {
    const segments = id.split('/');
    if (segments.length > 1) {
      // Check if package is an org path like `@blinkk/root`.
      if (segments[0].startsWith('@') && segments[0].length > 1) {
        return `${segments[0]}/${segments[1]}`;
      }
      // For imports like `my-package/subpackage`, return `my-package`.
      return segments[0];
    }
    return id;
  }

  await build({
    entryPoints: [configPath],
    bundle: true,
    minify: true,
    platform: 'node',
    outfile: outPath,
    sourcemap: 'inline',
    metafile: true,
    format: 'esm',
    plugins: [
      // Externalizes deps that are in package.json.
      {
        name: 'externalize-package-json-deps',
        setup(build) {
          build.onResolve({filter: /.*/}, (args) => {
            const id = args.path;
            if (id[0] !== '.' && !id.startsWith('@/')) {
              const packageName = getPackageName(id);
              if (packageName in allDeps) {
                return {
                  external: true,
                };
              }
            }
            return null;
          });
        },
      },
    ],
  });
}

/**
 * Loads a pre-bundled config file from dist/root.config.js.
 */
export async function loadBundledConfig(
  rootDir: string,
  options: ConfigOptions
): Promise<RootConfig> {
  const configPath = path.resolve(rootDir, 'dist/root.config.js');
  const exists = await fileExists(configPath);
  if (!exists) {
    throw new Error(`${configPath} does not exist`);
  }
  const module = await import(configPath);
  let config = module.default || {};
  if (typeof config === 'function') {
    config = (await config(options)) || {};
  }
  return Object.assign({}, config, {rootDir});
}

export async function loadPackageJson(filepath: string): Promise<any> {
  try {
    const packageJson = await loadJson(filepath);
    return packageJson || {};
  } catch (err) {
    return {};
  }
}
