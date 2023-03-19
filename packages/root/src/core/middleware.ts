import {RootConfig} from './config';
import {Request, Response, NextFunction} from './types';

/**
 * Middleware that injects the root.js project config into the request context.
 */
export function rootProjectMiddleware(options: {rootConfig: RootConfig}) {
  return (req: Request, _: Response, next: NextFunction) => {
    req.rootConfig = options.rootConfig;
    next();
  };
}
