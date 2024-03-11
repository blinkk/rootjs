import {Request, Response, NextFunction, Plugin, Server} from '@blinkk/root';
import micromatch from 'micromatch';
import {renderPasswordPage} from './password-page.js';

export interface PasswordProtectedRoute {
  /**
   * URL glob pattern to match (regex not supported yet).
   */
  source: string;

  password: {
    /**
     * A hash of the password. Note: a plain-text password should never be
     * stored in code. Consider storing this value in a `.env` file for extra
     * security.
     *
     * Generate this by running:
     * ```
     * root-password-protect generate-hash "MY_PASSWORD"
     * ````
     */
    hash: string;

    /**
     * A random string used to generate the password hash.
     *
     * Generate this by running:
     * ```
     * root-password-protect generate-hash "MY_PASSWORD"
     * ````
     */
    salt: string;
  };
}

export interface PasswordProtectPluginOptions {
  protectedRoutes: PasswordProtectedRoute[];
}

export function passwordProtectPlugin(
  options: PasswordProtectPluginOptions
): Plugin {
  const protectedRoutesUserConfig = options.protectedRoutes || [];
  const protectedRoutes = protectedRoutesUserConfig.filter((protectedRoute) => {
    return Boolean(
      protectedRoute.source &&
        protectedRoute.password &&
        protectedRoute.password.hash &&
        protectedRoute.password.salt
    );
  });

  /**
   * Returns the first password-protected route that matches.
   */
  function getProtectedRouteConfig(
    req: Request
  ): PasswordProtectedRoute | null {
    for (const protectedRoute of protectedRoutes) {
      if (micromatch.isMatch(req.path, protectedRoute.source)) {
        return protectedRoute;
      }
    }
    return null;
  }

  return {
    name: 'root-password-protect',
    configureServer: (server: Server) => {
      if (protectedRoutes.length === 0) {
        return;
      }
      server.use((req: Request, res: Response, next: NextFunction) => {
        const protectedRoute = getProtectedRouteConfig(req);
        if (protectedRoute) {
          handleProtectedRoute(protectedRoute, req, res, next);
          return;
        }
        next();
      });
    },
  };
}

async function handleProtectedRoute(
  protectedRoute: PasswordProtectedRoute,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.method === 'POST') {
    // TODO(stevenle): Verify password and set cookie.
    return;
  }

  renderPasswordPage(req, res);
}
