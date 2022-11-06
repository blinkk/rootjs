import {RootConfig} from './config';
import {Request, Response, NextFunction} from './types';

/**
 * Middleware that injects the root.js project config into the request context.
 */
export function rootProjectMiddleware(options: {
  rootDir: string;
  rootConfig: RootConfig;
}) {
  return (req: Request, _: Response, next: NextFunction) => {
    req.rootConfig = Object.assign({}, options.rootConfig, {
      rootDir: options.rootDir,
    });
    next();
  };
}
