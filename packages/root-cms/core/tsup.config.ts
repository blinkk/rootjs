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
  },
  target: 'node22',
  dts: {
    // tsup passes `baseUrl` which will be deprecated in typescript 7.0.
    // https://github.com/egoist/tsup/issues/1388
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
    entry: [
      './core/client.ts',
      './core/core.ts',
      './core/functions.ts',
      './core/plugin.ts',
      './core/project.ts',
      './core/richtext.tsx',
    ],
  },
  format: ['esm'],
  splitting: true,
  platform: 'node',
  external: [/^virtual:/],
  esbuildOptions(options) {
    options.tsconfig = './core/tsconfig.json';
  },
});
