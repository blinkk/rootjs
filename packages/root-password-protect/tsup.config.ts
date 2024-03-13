/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    cli: './src/cli/cli.ts',
    core: './src/core/core.ts',
    plugin: './src/plugin/plugin.tsx',
  },
  sourcemap: 'inline',
  target: 'node18',
  dts: {
    entry: {
      core: './src/core/core.ts',
      plugin: './src/plugin/plugin.tsx',
    },
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './tsconfig.json';
  },
});
