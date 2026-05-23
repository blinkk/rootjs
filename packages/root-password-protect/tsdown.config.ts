import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: {
    cli: './src/cli/cli.ts',
    core: './src/core/core.ts',
    plugin: './src/plugin/plugin.tsx',
  },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  sourcemap: 'inline',
  deps: {
    skipNodeModulesBundle: true,
  },
  tsconfig: './tsconfig.json',
  dts: true,
});
