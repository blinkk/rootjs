import {RootRedirectConfig} from '../core/config.js';
import {NextFunction, Request, Response} from '../core/types.js';
import {RouteTrie} from '../render/route-trie.js';

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
  if (!redirect.source.startsWith('/')) {
    return false;
  }
  if (!redirect.destination) {
    return false;
  }
  if (!testIsRedirectValid(redirect.destination)) {
    return false;
  }
  // TODO(stevenle): verify all destination params exist within source.
  return true;
}

/**
 * Replaces placeholders in a URL path format string with actual values.
 *
 * @param urlPathFormat The URL path format string containing parameter placeholders in the format `[key]` or `[...key]`.
 * @param params A map of parameter names to their corresponding values.
 * @returns The URL path with all parameter placeholders replaced by their corresponding values.
 */
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

/**
 * Only support full urls (e.g. https://...) and relative paths (e.g. /foo/...).
 */
function testIsRedirectValid(url: string) {
  if (url.startsWith('/')) {
    return true;
  }
  if (url.match(/^https?:\/\//)) {
    return true;
  }
  return false;
}
