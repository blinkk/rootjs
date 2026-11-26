import path from 'node:path';
import {RootConfig} from '../core/config.js';
import {fileExists} from '../utils/fsutils.js';

/**
 * Options passed when loading a Root.js config file.
 */
export interface ConfigOptions {
  /** CLI command name (e.g. "build", "dev", "start", "preview"). */
  command: string;
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
