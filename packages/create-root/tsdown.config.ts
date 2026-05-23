import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: ['./src/create-root.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  deps: {
    skipNodeModulesBundle: true,
  },
});
