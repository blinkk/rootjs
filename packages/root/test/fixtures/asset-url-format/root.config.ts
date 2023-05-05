import {defineConfig} from '../../../dist/core';

export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'static/assets/[name].[hash].min.js',
          chunkFileNames: 'static/chunks/[name].[hash].min.js',
          assetFileNames: 'static/assets/[name].[hash][extname]',
          sanitizeFileName: (name: string) => {
            return name
              .replaceAll('...', '')
              .replaceAll('_', '')
              .replaceAll('[', '')
              .replaceAll(']', '');
          },
        },
      },
    },
  },
  prettyHtml: true,
});
