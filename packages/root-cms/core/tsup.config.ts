/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    app: './core/app.tsx',
    cli: './cli/cli.ts',
    client: './core/client.ts',
    core: './core/core.ts',
    functions: './core/functions.ts',
    plugin: './core/plugin.ts',
    project: './core/project.ts',
    richtext: './core/richtext.tsx',
    extract: './core/extract.ts',
  },
  target: 'node22',
  dts: {
    entry: [
      './core/client.ts',
      './core/core.ts',
      './core/functions.ts',
      './core/plugin.ts',
      './core/project.ts',
      './core/richtext.tsx',
      './core/extract.ts',
    ],
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './core/tsconfig.json';
  },
});
