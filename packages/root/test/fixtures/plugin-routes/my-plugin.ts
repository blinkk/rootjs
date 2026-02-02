import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Plugin} from '../../../dist/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    routes: {
      '/plugin-route': path.resolve(__dirname, 'my-route.tsx'),
      '/products/[id]': path.resolve(__dirname, 'product-route.tsx'),
      '/wiki/[[...slug]]': path.resolve(__dirname, 'wiki-route.tsx'),
      '/props': path.resolve(__dirname, 'props-route.tsx'),
      '/handler': path.resolve(__dirname, 'handler-route.tsx'),
      '/api/data': path.resolve(__dirname, 'api-route.tsx'),
    },
  };
}
