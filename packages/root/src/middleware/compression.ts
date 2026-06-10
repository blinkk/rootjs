import zlib from 'node:zlib';

import compression from 'compression';

import {Request, Response, NextFunction} from '../core/types.js';

/**
 * Response compression middleware shared by the preview and prod servers.
 *
 * Uses brotli when the client accepts it (`Accept-Encoding: br`), falling
 * back to gzip. Brotli quality 4 is used as a balance between compression
 * ratio and CPU cost for dynamically-rendered responses — it generally
 * compresses better than gzip's default (level 6) at comparable speed.
 * Pre-compressed static assets should still be served with higher quality
 * settings by a CDN or static file server where possible.
 */
export function compressionMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return compression({
    brotli: {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
      },
    },
  }) as (req: Request, res: Response, next: NextFunction) => void;
}
