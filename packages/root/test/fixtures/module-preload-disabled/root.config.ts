import {defineConfig} from '../../../dist/core.js';

// Same project as the `module-preload` fixture, with `modulePreload: false`,
// to verify that the tags can be disabled.
export default defineConfig({
  modulePreload: false,
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
