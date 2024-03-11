/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    cli: './cli/cli.ts',
    core: './core/core.ts',
    plugin: './core/plugin.ts',
  },
  sourcemap: 'inline',
  target: 'node16',
  dts: {
    entry: ['./core/core.ts', './core/plugin.ts'],
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './core/tsconfig.json';
  },
});
