import {Request, Response, NextFunction, Plugin, Server} from '@blinkk/root';
import bodyParser from 'body-parser';
import micromatch from 'micromatch';
import {renderToString} from 'preact-render-to-string';
import {
  PasswordPage,
  PasswordPageProps,
} from '../components/PasswordPage/PasswordPage.js';
import {generateNonce, setSecurityHeaders} from '../core/csp.js';
import {hashPassword, verifyPassword} from '../core/password.js';

/** Props for sites to provide a custom password page. */
export type {PasswordPageProps};

const SESSION_COOKIE_HASH = 'password_protect.hash';
const SESSION_COOKIE_SALT = 'password_protect.salt';

export interface PasswordProtectedRoute {
  /**
   * URL glob pattern to match (regex not supported yet).
   */
  source: string;

  /**
   * Customize the page to display to unauthorized users. To create a custom
   * page, send a POST request to itself with a form that contains a single
   * field "password".
   *
   * Falls back to:
   * 1. The route that the URL provided here resolves to (if specified). For
   *    example, `/protected/` would resolve to `routes/protected.tsx`.
   * 2. The route at `routes/401.tsx` (if it exists).
   * 3. The default password page provided by the plugin.
   */
  unauthorizedPageUrl?: string;

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
      renderPasswordPage(req, res, protectedRoute, {
        error: 'Bad request (no password).',
      });
      return;
    }

    const password = req.body.password as string;
    const isValid = await verifyPassword(
      password,
      protectedRoute.password.hash,
      protectedRoute.password.salt
    );
    if (!isValid) {
      renderPasswordPage(req, res, protectedRoute, {
        error: 'Incorrect password.',
      });
      return;
    }
    // Set a session cookie value to verify subsequent requests.
    await setSessionCookie(protectedRoute, res);
    next();
    return;
  }

  // If previously logged in, check the session cookie against the current
  // password hash.
  const isValid = await verifySessionCookie(protectedRoute, req);
  if (isValid) {
    next();
    return;
  }

  renderPasswordPage(req, res, protectedRoute);
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
  protectedRoute: PasswordProtectedRoute,
  props?: Omit<PasswordPageProps, 'nonce'>
) {
  const [customRoute] =
    req.renderer?.getRoute(protectedRoute.unauthorizedPageUrl || '/401') ?? [];
  const Component = customRoute?.module.default ?? PasswordPage;
  const nonce = generateNonce();
  const mainHtml = renderToString(<Component {...props} nonce={nonce} />);
  const html = `<!doctype html>\n${mainHtml}`;
  res.setHeader('content-type', 'text/html');
  setSecurityHeaders(res, nonce);
  res.send(html);
}
