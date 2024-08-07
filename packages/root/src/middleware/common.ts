import path from 'node:path';
import micromatch from 'micromatch';
import {RootConfig} from '../core/config.js';
import {Request, Response, NextFunction} from '../core/types.js';

/**
 * Middleware that injects the root.js project config into the request context.
 */
export function rootProjectMiddleware(options: {rootConfig: RootConfig}) {
  return (req: Request, _: Response, next: NextFunction) => {
    req.rootConfig = options.rootConfig;
    next();
  };
}

/**
 * Middleware that injects HTTP headers from the `server.headers` config in
 * root.config.ts.
 */
export function headersMiddleware(options: {rootConfig: RootConfig}) {
  const headersUserConfig = options.rootConfig.server?.headers || [];
  // Filter header config values that are invalid.
  const headersConfig = headersUserConfig.filter((headerConfig) => {
    return (
      headerConfig.source &&
      headerConfig.headers &&
      headerConfig.headers.length > 0
    );
  });
  return (req: Request, res: Response, next: NextFunction) => {
    headersConfig.forEach((headerConfig) => {
      if (micromatch.isMatch(req.path, headerConfig.source)) {
        headerConfig.headers.forEach((header) => {
          if (header.key) {
            res.setHeader(String(header.key), String(header.value));
          }
        });
      }
    });
    next();
  };
}

/**
 * Trailing slash middleware. Handles trailing slash redirects (preserving any
 * query params) using the `server.trailingSlash` config in root.config.ts.
 */
export function trailingSlashMiddleware(options: {rootConfig: RootConfig}) {
  const trailingSlash = options.rootConfig.server?.trailingSlash;

  return (req: Request, res: Response, next: NextFunction) => {
    // If `trailingSlash: false`, force a trailing slash in the URL.
    if (
      trailingSlash === true &&
      !path.extname(req.path) &&
      !req.path.endsWith('/')
    ) {
      const redirectPath = `${req.path}/`;
      redirectWithQuery(req, res, 301, redirectPath);
      return;
    }

    // If `trailingSlash: false`, remove any trailing slash from the URL.
    if (
      trailingSlash === false &&
      !path.extname(req.path) &&
      req.path !== '/' &&
      req.path.endsWith('/')
    ) {
      const redirectPath = removeTrailingSlashes(req.path);
      redirectWithQuery(req, res, 301, redirectPath);
      return;
    }

    next();
  };
}

/**
 * Issues an HTTP redirect, preserving any query params from the original req.
 */
function redirectWithQuery(
  req: Request,
  res: Response,
  redirectCode: number,
  redirectPath: string
) {
  const queryStr = getQueryStr(req);
  const redirectUrl = queryStr ? `${redirectPath}?${queryStr}` : redirectPath;
  res.redirect(redirectCode, redirectUrl);
}

/**
 * Returns the query string for a request, or empty string if no query.
 */
function getQueryStr(req: Request): string {
  const qIndex = req.originalUrl.indexOf('?');
  if (qIndex === -1) {
    return '';
  }
  return req.originalUrl.slice(qIndex + 1);
}

/**
 * Removes trailing slashes from a URL path.
 * Note: A path with only slashes (e.g. `///`) returns `/`.
 */
function removeTrailingSlashes(urlPath: string) {
  while (urlPath.endsWith('/') && urlPath !== '/') {
    urlPath = urlPath.slice(0, -1);
  }
  return urlPath;
}
