import {Request, Response, NextFunction, Plugin, Server} from '@blinkk/root';
import bodyParser from 'body-parser';
import micromatch from 'micromatch';
import {renderToString} from 'preact-render-to-string';
import {PasswordPage} from '../components/PasswordPage/PasswordPage.js';
import {generateNonce, setSecurityHeaders} from '../core/csp.js';
import {hashPassword, verifyPassword} from '../core/password.js';

const SESSION_COOKIE_HASH = 'password_protect.hash';
const SESSION_COOKIE_SALT = 'password_protect.salt';

export enum PasswordProtectError {
  UNKNOWN = 'UNKNOWN',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  PASSWORD_INVALID = 'PASSWORD_INVALID',
}

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
      server.use(bodyParser.urlencoded({extended: true}));
      server.use(async (req: Request, res: Response, next: NextFunction) => {
        const protectedRoute = getProtectedRouteConfig(req);
        if (protectedRoute) {
          await handleProtectedRoute(protectedRoute, req, res, next);
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
    // Verify password and if valid set a session cookie.
    if (
      req.get('content-type') !== 'application/x-www-form-urlencoded' ||
      !req.body ||
      !req.body.password
    ) {
      res.status(400);
      return renderPasswordPage(req, res, {
        error: PasswordProtectError.PASSWORD_REQUIRED,
      });
    }

    const password = req.body.password as string;
    const isValid = await verifyPassword(
      password,
      protectedRoute.password.hash,
      protectedRoute.password.salt
    );
    if (!isValid) {
      return renderPasswordPage(req, res, {
        error: PasswordProtectError.PASSWORD_INVALID,
      });
    }
    // Set a session cookie value to verify subsequent requests.
    await setSessionCookie(protectedRoute, res);
    return next();
  }

  // If previously logged in, check the session cookie against the current
  // password hash.
  const isValid = await verifySessionCookie(protectedRoute, req);
  if (isValid) {
    return next();
  }

  return renderPasswordPage(req, res);
}

/**
 * Saves a verification token to the session cookie for subsequent requests.
 */
async function setSessionCookie(
  protectedRoute: PasswordProtectedRoute,
  res: Response
) {
  const {hash, salt} = await hashPassword(protectedRoute.password.hash);
  res.session.setItem(SESSION_COOKIE_HASH, hash);
  res.session.setItem(SESSION_COOKIE_SALT, salt);
  res.saveSession();
}

/**
 * Verifies the session cookie value is valid.
 */
async function verifySessionCookie(
  protectedRoute: PasswordProtectedRoute,
  req: Request
) {
  const hash = req.session.getItem(SESSION_COOKIE_HASH);
  const salt = req.session.getItem(SESSION_COOKIE_SALT);
  if (!hash || !salt) {
    return false;
  }
  return await verifyPassword(protectedRoute.password.hash, hash, salt);
}

/**
 * Renders the login page to a response.
 */
export async function renderPasswordPage(
  req: Request,
  res: Response,
  options?: {error?: PasswordProtectError}
) {
  // If there's no `/401` route, fall back to the default password page.
  const defaultHandler = () => {
    const nonce = generateNonce();
    res.setHeader('content-type', 'text/html');
    res.status(401);
    setSecurityHeaders(res, nonce);
    const errorMsg = getErrorMessage(options?.error);
    const mainHtml = renderToString(
      <PasswordPage error={errorMsg} nonce={nonce} />
    );
    const html = `<!doctype html>\n${mainHtml}`;
    res.send(html);
  };

  // If the app defines `routes/401.tsx`, render that page.
  if (req.renderer) {
    const [route, routeParams] = req.renderer.getRoute('/401');
    if (route) {
      // Add the error type to the req object. Routes that define a `handle()`
      // method should be able to read from it to construct an appropriate
      // error message for the page.
      (req as any).passwordProtect = {error: options?.error};
      return req.renderer.handleRoute(req, res, defaultHandler, route, {
        defaultStatusCode: 401,
        routeParams: routeParams,
      });
    }
  }
  return defaultHandler();
}

/**
 * Converts a `PasswordProtectError` to a user-friendly error message.
 */
function getErrorMessage(error?: PasswordProtectError) {
  if (!error) {
    return undefined;
  }
  if (error === PasswordProtectError.PASSWORD_REQUIRED) {
    return 'Bad request (no password).';
  }
  if (error === PasswordProtectError.PASSWORD_INVALID) {
    return 'Incorrect password.';
  }
  return 'Unknown error.';
}
