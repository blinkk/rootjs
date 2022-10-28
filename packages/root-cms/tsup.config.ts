/* eslint-disable node/no-unpublished-import */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    schema: 'src/schema.ts',
  },
  sourcemap: true,
  target: 'node16',
  dts: true,
  format: ['esm'],
});
