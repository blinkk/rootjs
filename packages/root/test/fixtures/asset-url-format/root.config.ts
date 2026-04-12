import {defineConfig} from '../../../dist/core';

export default defineConfig({
  vite: {
    build: {
      rolldownOptions: {
        output: {
          entryFileNames: 'static/assets/[name].[hash].min.js',
          chunkFileNames: 'static/chunks/[name].[hash].min.js',
          assetFileNames: 'static/assets/[name].[hash][extname]',
        },
      },
    },
  },
  jsxRenderer: {
    mode: 'pretty',
  },
});
