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
  prettyHtml: true,
  prettyHtmlOptions: {
    indent_size: 0,
    end_with_newline: true,
    inline: ['a'],
    extra_liners: ['img', 'p', 'h2'],
    unformatted: ['p'],
  },
});
