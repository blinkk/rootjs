/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/cli.ts',
    core: 'src/core/core.ts',
    functions: 'src/functions/functions.ts',
    middleware: 'src/middleware/middleware.ts',
    node: 'src/node/node.ts',
    render: 'src/render/render.tsx',
  },
  sourcemap: true,
  target: 'node16',
  dts: true,
  format: ['esm'],
  splitting: true,
});
