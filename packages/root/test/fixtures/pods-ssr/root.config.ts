import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '../../../dist/core';

const rootDir = new URL('.', import.meta.url).pathname;
const podDir = path.resolve(rootDir, 'pod');

export default defineConfig({
  prettyHtml: true,
  plugins: [
    {
      name: 'test-pod',
      pod: {
        name: 'test-pod',
        mount: '/from-pod',
        routesDir: path.join(podDir, 'routes'),
      },
    },
  ],
});
