/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    app: './core/app.tsx',
    cli: './cli/cli.ts',
    core: './core/core.ts',
    functions: './core/functions.ts',
    plugin: './core/plugin.ts',
    project: './core/project.ts',
  },
  sourcemap: 'inline',
  target: 'node16',
  dts: {
    entry: [
      './core/core.ts',
      './core/functions.ts',
      './core/plugin.ts',
      './core/project.ts',
    ],
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './core/tsconfig.json';
  },
});
