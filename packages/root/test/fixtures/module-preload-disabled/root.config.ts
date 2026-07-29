import {defineConfig} from '../../../dist/core.js';

// Same project as the `module-preload` fixture, minus the `modulePreload`
// option, to verify that the tags are opt-in.
export default defineConfig({
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
