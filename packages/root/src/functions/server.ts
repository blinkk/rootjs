import path from 'node:path';
import {HttpsOptions, onRequest} from 'firebase-functions/v2/https';
import {createPreviewServer, createProdServer} from '../cli/cli';
import {Server} from '../core/types';

export interface ProdServerOptions {
  rootDir?: string;
  mode?: 'preview' | 'production';
  httpsOptions?: HttpsOptions;
}

/**
 * Firebase Function that runs a Root.js server running in SSR mode.
 */
export function server(options?: ProdServerOptions) {
  let rootServer: Server;
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  return onRequest(options?.httpsOptions || {}, async (req, res) => {
    if (!rootServer) {
      if (options?.mode === 'preview') {
        rootServer = await createPreviewServer({rootDir});
      } else {
        rootServer = await createProdServer({rootDir});
      }
    }
    await rootServer(req, res);
  });
}
