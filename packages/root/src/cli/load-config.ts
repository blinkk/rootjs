import {bundleRequire} from 'bundle-require';
import JoyCon from 'joycon';
import {RootConfig} from '../core/config';

export async function loadRootConfig(rootDir: string): Promise<RootConfig> {
  const joycon = new JoyCon();
  const configPath = await joycon.resolve({
    cwd: rootDir,
    files: ['root.config.ts'],
  });
  if (configPath) {
    const configBundle = await bundleRequire({
      filepath: configPath,
    });
    return configBundle.mod.default || {};
  }
  return {};
}
