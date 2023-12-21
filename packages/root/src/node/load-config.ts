import path from 'node:path';
import {bundleRequire} from 'bundle-require';
import {build} from 'esbuild';
import {RootConfig} from '../core/config';
import {fileExists} from '../utils/fsutils';

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
  const exists = await fileExists(configPath);
  if (!exists) {
    throw new Error(`${configPath} does not exist`);
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
      {
        name: 'externalize-deps',
        setup(build) {
          build.onResolve({filter: /.*/}, (args) => {
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
