import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Plugin} from '@blinkk/root';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POD_DIR = path.resolve(__dirname, '../pod/example-tool');

/**
 * Mounts a simple iframe-able "tool" at `/cms-tools/<id>` for manually testing
 * the sidebar tool <-> CMS URL sync. The tool has a few sub-pages (with links,
 * query params, and hashes) so navigating around should be mirrored into the
 * CMS address bar as `/cms/tools/<id>/...`. Register two of these (e.g. `a` and
 * `b`) to also exercise switching between tools.
 *
 * Each id has its own `routes/` dir (`pod/example-tool/<id>/routes`) because
 * pod routes are keyed by file path, so two pods sharing one routes dir would
 * collide and one would 404. The route files just re-export the shared page
 * components.
 */
export function exampleToolPod(id: string): Plugin {
  return {
    name: `example-tool-pod-${id}`,
    pod: {
      name: `example-tool-pod-${id}`,
      mount: `/cms-tools/${id}`,
      routesDir: path.join(POD_DIR, id, 'routes'),
    },
  };
}
