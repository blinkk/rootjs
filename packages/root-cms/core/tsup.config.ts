/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    app: './core/app.tsx',
    core: './core/index.ts',
    plugin: './core/plugin.ts',
  },
  sourcemap: 'inline',
  target: 'node16',
  dts: {
    entry: ['./core/index.ts', './core/plugin.ts'],
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './core/tsconfig.json';
  },
});
