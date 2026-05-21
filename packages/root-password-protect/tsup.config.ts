import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    cli: './src/cli/cli.ts',
    core: './src/core/core.ts',
    plugin: './src/plugin/plugin.tsx',
  },
  sourcemap: 'inline',
  target: 'node22',
  dts: {
    entry: {
      core: './src/core/core.ts',
      plugin: './src/plugin/plugin.tsx',
    },
    // tsup passes `baseUrl` which will be deprecated in typescript 7.0.
    // https://github.com/egoist/tsup/issues/1388
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
  format: ['esm'],
  splitting: false,
  platform: 'node',
  esbuildOptions(options) {
    options.tsconfig = './tsconfig.json';
  },
});
