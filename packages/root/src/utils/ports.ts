import {createServer} from 'node:net';

/**
 * Checks whether a port is open.
 */
export function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(err);
    });
    server.on('close', () => {
      resolve(true);
    });
    server.listen(port, () => {
      server.close((err) => {
        if (err) {
          console.log(`error closing server: ${err}`);
          reject(err);
        }
      });
    });
  });
}

/**
 * Finds the first open port between two values.
 */
export async function findOpenPort(min: number, max: number): Promise<number> {
  let port = min;
  while (port <= max) {
    const isOpen = await isPortOpen(port);
    if (isOpen) {
      return port;
    }
    port += 1;
  }
  throw new Error(`no ports open between ${min} and ${max}`);
}
