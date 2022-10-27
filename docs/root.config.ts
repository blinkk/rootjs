import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';

const rootDir = new URL('.', import.meta.url).pathname;;

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(rootDir),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          includePaths: [path.resolve(rootDir, './styles')],
        },
      },
    },
  },
});
