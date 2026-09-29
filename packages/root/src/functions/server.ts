import path from 'node:path';
import {HttpsOptions, onRequest} from 'firebase-functions/v2/https';
import {createPreviewServer, createProdServer} from '../cli/cli.js';
import {Server} from '../core/types.js';

export interface ProdServerOptions {
  rootDir?: string;
  mode?: 'preview' | 'production';
  httpsOptions?: HttpsOptions;
}

/**
 * Firebase Function that runs a Root.js server running in SSR mode.
 */
export function server(options?: ProdServerOptions) {
  let rootServerPromise: Promise<Server> | null = null;
  const rootDir = path.resolve(options?.rootDir || process.cwd());

  // Instances serve many concurrent requests, so the server is created once
  // and shared by every request that arrives while it is still starting up.
  // A failed startup is cleared so that the next request retries it.
  function getRootServer(): Promise<Server> {
    if (!rootServerPromise) {
      const createServer =
        options?.mode === 'preview' ? createPreviewServer : createProdServer;
      rootServerPromise = createServer({rootDir}).catch((err) => {
        rootServerPromise = null;
        throw err;
      });
    }
    return rootServerPromise;
  }

  return onRequest(options?.httpsOptions || {}, async (req, res) => {
    let rootServer: Server;
    try {
      rootServer = await getRootServer();
    } catch (err) {
      console.error('failed to start the root.js server:');
      console.error(err);
      res.status(500).set({'Content-Type': 'text/plain'}).end('500');
      return;
    }
    await rootServer(req, res);
  });
}
