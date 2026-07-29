import {defineConfig} from '../../../dist/core.js';

export default defineConfig({
  modulePreload: true,
  jsxRenderer: {
    mode: 'pretty',
    blockElements: ['root-a', 'root-b'],
  },
  vite: {
    build: {
      rolldownOptions: {
        output: {
          // For testing, avoid adding [hash] so that the builds are
          // deterministic.
          entryFileNames: 'assets/[name].min.js',
          chunkFileNames: 'chunks/[name].min.js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  },
});
