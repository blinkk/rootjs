import path from 'node:path';
import {defineConfig} from '@blinkk/root';

const rootDir = process.cwd();

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
