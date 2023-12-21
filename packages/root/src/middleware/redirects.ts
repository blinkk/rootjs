import {RootRedirectConfig} from '../core/config';
import {NextFunction, Request, Response} from '../core/types';
import {RouteTrie} from '../render/route-trie';

export interface RedirectsMiddlewareOptions {
  redirects: RootRedirectConfig[];
}

/**
 * Middleware for handling server-side redirects from the `server.redirects`
 * config in `root.config.ts`.
 */
export function redirectsMiddleware(options: RedirectsMiddlewareOptions) {
  const routeTrie = new RouteTrie<RootRedirectConfig>();
  const redirects = options.redirects || [];
  redirects.forEach((redirect) => {
    if (!verifyRedirectConfig(redirect)) {
      console.warn('ignoring invalid redirect config:', redirect);
      return;
    }
    routeTrie.add(redirect.source!, redirect);
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const [redirect, params] = routeTrie.get(req.path);
    if (redirect) {
      const destination = replaceParams(redirect.destination!, params);
      const code = redirect.type || 302;
      res.redirect(code, destination);
      return;
    }
    next();
  };
}

function verifyRedirectConfig(redirect: RootRedirectConfig) {
  if (!redirect.source) {
    return false;
  }
  if (!redirect.destination) {
    return false;
  }
  // TODO(stevenle): verify all destination params exist within source.
  return true;
}

function replaceParams(urlPathFormat: string, params: Record<string, string>) {
  const urlPath = urlPathFormat.replaceAll(
    /\[\[?(\.\.\.)?([\w\-_]*)\]?\]/g,
    (match: string, _wildcard: string, key: string) => {
      const val = params[key];
      if (!val) {
        throw new Error(`unreplaced param ${match} in url: ${urlPathFormat}`);
      }
      return val;
    }
  );
  return urlPath;
}
