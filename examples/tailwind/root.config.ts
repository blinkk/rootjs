import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import tailwindcss from '@tailwindcss/vite';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir),
      },
    },
  },
  prettyHtml: true,
});
