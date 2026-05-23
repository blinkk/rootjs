import {defineConfig} from 'tsdown';

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
  format: 'esm',
  platform: 'node',
  target: 'node18',
  fixedExtension: false,
  sourcemap: true,
  deps: {
    neverBundle: [/^virtual:/],
  },
  globImport: false,
  dts: true,
});
