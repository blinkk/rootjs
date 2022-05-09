/* eslint-disable node/no-unpublished-import */
import * as path from 'path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import hashsum from 'hash-sum';

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  return {
    base: mode === 'production' ? '/cms/' : '/',
    server: {
      proxy: {
        '/cms/api': 'http://localhost:4007',
      },
    },
    css: {
      modules: {
        generateScopedName: (name, filename, css) => {
          const ident = path.basename(filename).split('.')[0];
          const hash = hashsum(css);
          return `${ident}_${name}__${hash.substr(0, 5)}`;
        },
      },
      preprocessorOptions: {
        scss: {
          includePaths: [path.join(__dirname, 'src/styles')],
        },
      },
    },
    plugins: [react()],
    clearScreen: false,
  };
});
