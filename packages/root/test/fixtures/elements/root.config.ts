import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '../../../dist/core';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  prettyHtml: true,
  elements: {
    include: [path.resolve(rootDir, 'designsystem')],
    exclude: [/\.stories\.tsx$/],
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // For testing, avoid adding [hash] so that the builds are
          // deterministic.
          entryFileNames: 'assets/[name].min.js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  },
});
