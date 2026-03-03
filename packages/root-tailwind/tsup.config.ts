/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    core: './src/core.ts',
  },
  sourcemap: 'inline',
  target: 'node18',
  dts: true,
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './tsconfig.json';
  },
});
