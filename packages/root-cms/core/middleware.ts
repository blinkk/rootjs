import {NextFunction, Request, RequestMiddleware, Response} from '@blinkk/root';

export interface RequireLoginOptions {
  /**
   * Restricts the guard to matching request paths. Accepts a path prefix (e.g.
   * `/admin`), a list of prefixes, or a predicate `(req) => boolean`. When
   * omitted, login is enforced for every request the middleware sees.
   *
   * This is useful when adding the middleware to `root.config.ts`'s
   * `server.middlewares`, which are mounted app-wide with no path scope.
   */
  match?: string | string[] | ((req: Request) => boolean);

  /**
   * The login page to redirect unauthenticated users to. Defaults to
   * `/cms/login`. The original URL is added as a `continue` query param so the
   * user is returned to the requested page after signing in.
   */
  loginUrl?: string;
}

/**
 * Express middleware that enforces Root CMS login on a custom route, without
 * requiring the `?preview=true` query param.
 *
 * The Root CMS plugin's auth middleware runs before any user middleware and
 * populates `req.user` on every request that carries a valid session cookie
 * (see core/plugin.ts). This guard simply requires that `req.user` to exist:
 * authenticated requests fall through to the next handler, while
 * unauthenticated ones are redirected to the CMS login page (or answered with a
 * `401` for API / XHR requests).
 *
 * It must be used in a project that installs the `root-cms` plugin, since that
 * plugin is what resolves and attaches `req.user`.
 *
 * Usage in `root.config.ts` — protect everything under `/admin`:
 *
 *     import {requireCmsLogin} from '@blinkk/root-cms';
 *
 *     export default defineConfig({
 *       server: {
 *         middlewares: [requireCmsLogin({match: '/admin'})],
 *       },
 *     });
 *
 * Or, from a plugin with direct `server` access, scope it with express:
 *
 *     server.use('/admin', requireCmsLogin());
 */
export function requireCmsLogin(
  options?: RequireLoginOptions
): RequestMiddleware {
  const loginUrl = options?.loginUrl || '/cms/login';
  const match = options?.match;
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip requests that fall outside the configured path scope.
    if (match && !matchesRequest(req, match)) {
      next();
      return;
    }
    // Authenticated: `req.user` is populated by the root-cms auth middleware.
    if (req.user) {
      next();
      return;
    }
    // Not authenticated. Return a 401 for API / XHR requests (which can't act on
    // a redirect), otherwise redirect to the login page with a `continue` param
    // so the user lands back here after signing in.
    const originalUrl = String(req.originalUrl);
    if (
      originalUrl.toLowerCase().startsWith('/cms/api') ||
      req.xhr ||
      expectsJson(req)
    ) {
      res.status(401).json({success: false, error: 'NOT_AUTHORIZED'});
      return;
    }
    const params = new URLSearchParams({continue: originalUrl});
    res.redirect(`${loginUrl}?${params.toString()}`);
  };
}

/** Tests a request path against a `match` option. */
function matchesRequest(
  req: Request,
  match: string | string[] | ((req: Request) => boolean)
): boolean {
  if (typeof match === 'function') {
    return match(req);
  }
  const urlPath = String(req.originalUrl).split('?')[0];
  const prefixes = Array.isArray(match) ? match : [match];
  return prefixes.some(
    (prefix) => urlPath === prefix || urlPath.startsWith(`${prefix}/`)
  );
}

/** Returns true when the request prefers a JSON response. */
function expectsJson(req: Request): boolean {
  const accept = String(req.headers?.accept || '');
  return accept.includes('application/json');
}
