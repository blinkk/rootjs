import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Plugin} from '@blinkk/root';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POD_DIR = path.resolve(__dirname, '../pod/templates');

export function templatesPod(): Plugin {
  return {
    name: 'templates-pod',
    pod: {
      name: 'templates-pod',
      mount: '/cms-tools/templates',
      routesDir: path.join(POD_DIR, 'routes'),
    },
  };
}
