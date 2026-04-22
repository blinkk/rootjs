/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli/cli.ts',
    core: 'src/core/core.ts',
    functions: 'src/functions/functions.ts',
    jsx: 'src/jsx/jsx.ts',
    'jsx/jsx-runtime': 'src/jsx/jsx-runtime.ts',
    'jsx/jsx-dev-runtime': 'src/jsx/jsx-dev-runtime.ts',
    middleware: 'src/middleware/middleware.ts',
    node: 'src/node/node.ts',
    render: 'src/render/render.tsx',
  },
  sourcemap: true,
  target: 'node18',
  dts: true,
  format: ['esm'],
  splitting: true,
});
