import path from 'node:path';
import {bundleRequire} from 'bundle-require';
import {build} from 'esbuild';
import {nodeExternalsPlugin} from 'esbuild-node-externals';
import {RootConfig} from '../core/config.js';
import {fileExists, loadJson} from '../utils/fsutils.js';

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
    // Externalize all dependencies.
    esbuildOptions: {
      plugins: [nodeExternalsPlugin()],
    },
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

  await build({
    entryPoints: [configPath],
    bundle: true,
    minify: true,
    platform: 'node',
    outfile: outPath,
    sourcemap: 'inline',
    metafile: true,
    format: 'esm',
    // Externalize all dependencies.
    plugins: [nodeExternalsPlugin()],
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
