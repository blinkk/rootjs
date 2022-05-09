import path from 'path';
import * as server from '../types';
import {Project} from '../../workspace/Project';
import send from 'send';

export interface CMSOptions {
  base?: string;
}

export function cms(project: Project, options?: CMSOptions) {
  const base = options?.base || '/cms';
  const dirPath = path.dirname(require.resolve('@blinkk/root-webui'));
  const htmlPath = path.join(dirPath, 'index.html');
  return async (
    req: server.Request,
    res: server.Response,
    next: server.NextFunction
  ) => {
    if (!req.originalUrl?.startsWith(base)) {
      return next();
    }

    try {
      let prefix = base;
      if (!prefix.endsWith('/')) {
        prefix = prefix + '/';
      }
      const relPath = req.originalUrl.slice(prefix.length);
      if (relPath.startsWith('assets')) {
        const assetPath = path.join(dirPath, relPath);
        // Prevent '..' traversal attacks.
        if (relPath.includes('..')) {
          res.writeHead(404, {'Content-Type': 'text/plain'});
          res.end('Not found');
          return;
        }
        await sendFile(req, res, assetPath);
        return;
      }
      await sendFile(req, res, htmlPath);
    } catch (e) {
      const err = e as Error;
      console.error(err);
      console.error(err.stack);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Internal server error');
    }
  };
}

function sendFile(
  req: server.Request,
  res: server.Response,
  filePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    send(req, filePath)
      .on('error', e => reject(e))
      .on('end', () => resolve())
      .pipe(res);
  });
}
