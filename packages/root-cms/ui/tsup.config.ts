/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    ui: './ui/ui.tsx',
  },
  sourcemap: 'inline',
  target: 'node16',
  platform: 'browser',
  dts: false,
  format: ['esm'],
  splitting: false,
  esbuildOptions(options) {
    options.tsconfig = './ui/tsconfig.json';
  },
});
