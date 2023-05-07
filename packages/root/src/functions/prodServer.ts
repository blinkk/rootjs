import path from 'node:path';
import * as https from 'firebase-functions/v2/https';
import {createProdServer} from '../cli/cli';
import {Server} from '../core/types';

export interface ProdServerOptions {
  rootProjectDir?: string;
}

/**
 * Firebase Function that runs a Root.js prod server running in SSR mode.
 */
export function prodServer(options?: ProdServerOptions) {
  let server: Server;
  const rootDir = path.resolve(options?.rootProjectDir || process.cwd());
  return https.onRequest(async (req, res) => {
    if (!server) {
      server = await createProdServer({rootDir});
    }
    await server(req, res);
  });
}
