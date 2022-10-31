/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema.ts',
  },
  sourcemap: true,
  target: 'node16',
  dts: true,
  format: ['esm'],
});
