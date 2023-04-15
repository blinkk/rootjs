import path from 'node:path';

import {bundleRequire} from 'bundle-require';

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
