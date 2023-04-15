import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  ConfigureServerOptions,
  NextFunction,
  Plugin,
  Request,
  Response,
  Server,
} from '@blinkk/root';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import {applicationDefault, initializeApp} from 'firebase-admin/app';
import {getAuth, DecodedIdToken} from 'firebase-admin/auth';
import sirv from 'sirv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AppModule = typeof import('./app.js');

const SESSION_COOKIE = '_rootjs_cms';

export type CMSUser = DecodedIdToken;

export type CMSPluginOptions = {
  /**
   * The ID of the project. Data will be stored under the namespace
   * `Projects/${id}` in firestore.
   */
  id?: string;

  /**
   * The name of the project. Used in the header of the CMS to help identify
   * the project.
   */
  name?: string;

  /**
   * Firebase config object, which can be obtained in the Firebase Console by
   * going to "Project Settings".
   */
  firebaseConfig: {
    [key: string]: string;
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };

  /** Secret value(s) used for signing the user authentication cookie. */
  cookieSecret?: string | string[];

  /** Function called to check if a user should have access to the CMS. */
  isUserAuthorized?: (
    req: Request,
    user: CMSUser
  ) => boolean | Promise<boolean>;

  /**
   * URL to GCI service for transforming uploaded GCS images to a Google App
   * Engine Images API serving URL. Defaults to "https://gci.rootjs.dev". To
   * disable, set this value to `false`.
   */
  gci?: string | boolean;
};

export type CMSPlugin = Plugin & {
  name: 'root-cms';
  getConfig: () => CMSPluginOptions;
};

function generateSecret(): string {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 36; i++) {
    const rand = Math.floor(Math.random() * chars.length);
    result.push(chars.charAt(rand));
  }
  return result.join('');
}

function isExpired(decodedIdToken: DecodedIdToken) {
  const ts = new Date().getTime() / 1000;
  return ts - decodedIdToken.auth_time > 5 * 60;
}

export function cmsPlugin(options: CMSPluginOptions): CMSPlugin {
  const firebaseConfig = options.firebaseConfig;
  const cookieSecret = options.cookieSecret || generateSecret();
  const app = initializeApp({
    projectId: firebaseConfig.projectId,
    credential: applicationDefault(),
  });
  const auth = getAuth(app);

  /**
   * Checks if login is required for the request. Currently returns `true` if
   * the URL path starts with /cms or if ?preview=true is in the URL.
   */
  function loginRequired(req: Request): boolean {
    if (req.originalUrl.startsWith('/cms')) {
      return true;
    }
    if (String(req.query.preview) === 'true') {
      return true;
    }
    return false;
  }

  /**
   * Verifies a new login request for a user. The request body should contain
   * an idToken, which is verified on prod using Firebase Admin and Identity
   * Toolkit. If a `isUserAuthorized()` config is set, this function will also
   * verify via that function. Returns true if the login verification succeeds.
   */
  async function verifyUserLogin(req: Request): Promise<boolean> {
    const idToken = req.body?.idToken;
    if (!idToken) {
      return false;
    }

    // On local dev, simply verify that an idToken is set. The identity toolkit
    // that verifies id tokens requires a service account, which we want to
    // avoid having to set up when users are doing local development.
    // Authentication is still required by the frontend using Firebase Auth,
    // this just bypasses the initial server check before the ui is rendered.
    if (process.env.NODE_ENV === 'development') {
      return Boolean(idToken);
    }

    try {
      const jwt = await auth.verifyIdToken(idToken, true);
      if (isExpired(jwt)) {
        return false;
      }
      if (!jwt.email || !jwt.email_verified) {
        return false;
      }
      if (options.isUserAuthorized) {
        return await options.isUserAuthorized(req, jwt);
      }
    } catch (err) {
      console.error('failed to verify jwt token');
      console.error(err);
      return false;
    }
    // TODO(stevenle): decide whether we want to enforce `isUserAuthorized()`.
    return true;
  }

  /**
   * Verifies whether the current user session should be allowed to access the
   * CMS. Returns true if access is granted.
   */
  async function verifyUserSession(req: Request): Promise<boolean> {
    const sessionCookie = String(req.cookies[SESSION_COOKIE] || '');
    if (!sessionCookie) {
      return false;
    }

    // On local dev, simply verify that an session cookie is set. See note
    // above in `verifyUserLogin()` for more information.
    if (process.env.NODE_ENV === 'development') {
      return Boolean(sessionCookie);
    }

    try {
      const jwt = await auth.verifySessionCookie(sessionCookie, true);
      if (isExpired(jwt)) {
        return false;
      }
      if (!jwt.email || !jwt.email_verified) {
        return false;
      }
      if (options.isUserAuthorized) {
        return await options.isUserAuthorized(req, jwt);
      }
      // TODO(stevenle): decide whether we want to enforce `isUserAuthorized()`.
      return true;
    } catch (err) {
      console.error('failed to verify jwt token');
      console.error(err);
      return false;
    }
  }

  return {
    name: 'root-cms',

    /**
     * Returns the config options passed to the plugin.
     */
    getConfig: () => {
      return options;
    },

    /**
     * A map of ssr files to include when running `root build`.
     */
    ssrInput: () => ({
      cms: path.resolve(__dirname, './app.js'),
    }),

    /**
     * Attaches CMS-specific middleware to the Root.js server.
     */
    configureServer: async (
      server: Server,
      serverOptions: ConfigureServerOptions
    ) => {
      server.use(cookieParser(cookieSecret));
      server.use(bodyParser.json());

      async function getRenderer(req: Request): Promise<AppModule> {
        if (serverOptions.type === 'dev') {
          const appFilePath = path.resolve(__dirname, './app.js');
          const app = (await req.viteServer!.ssrLoadModule(
            appFilePath
          )) as AppModule;
          return app;
        }

        const appImportPath = path.resolve(
          req.rootConfig!.rootDir,
          'dist/server/cms.js'
        );
        if (!(await fileExists(appImportPath))) {
          throw new Error(
            'dist/server/cms.js not found. run `root build` to create it.'
          );
        }
        const app = (await import(appImportPath)) as AppModule;
        return app;
      }

      const staticDir = path.resolve(__dirname, 'ui');
      server.use('/cms/static', sirv(staticDir, {dev: false}));

      // Login handler.
      server.use('/cms/login', async (req: Request, res: Response) => {
        if (
          req.method === 'PUT' &&
          req.headers['content-type'] === 'application/json'
        ) {
          try {
            const isAuthorized = await verifyUserLogin(req);
            if (!isAuthorized) {
              res.status(401).json({success: false, error: 'NOT_AUTHORIZED'});
              return;
            }

            // Set session expiration to 5 days.
            const expiresIn = 60 * 60 * 24 * 5 * 1000;
            const idToken = req.body.idToken!;

            let sessionCookie: string;
            if (process.env.NODE_ENV === 'development') {
              sessionCookie = idToken;
            } else {
              sessionCookie = await auth.createSessionCookie(idToken, {
                expiresIn,
              });
            }
            res.cookie(SESSION_COOKIE, sessionCookie, {
              maxAge: expiresIn,
              httpOnly: true,
              secure: true,
            });
            res.json({success: true});
          } catch (err) {
            console.error(err);
            if (err.stack) {
              console.error(err.stack);
            }
            res
              .status(500)
              .json({success: false, error: 'UNKNOWN_SERVER_ERROR'});
          }
          return;
        }

        try {
          const app = await getRenderer(req);
          app.renderSignIn(req, res, options);
        } catch (err) {
          console.error(err);
          if (err.stack) {
            console.error(err.stack);
          }
          res.status(500).send('UNKNOWN SERVER ERROR');
        }
      });

      // Logout handler.
      server.use('/cms/logout', async (req: Request, res: Response) => {
        res.clearCookie(SESSION_COOKIE);
        res.redirect('/cms/login');
      });

      // Safeguard to verify user login before rendering any CMS page.
      server.use(async (req: Request, res: Response, next: NextFunction) => {
        if (!loginRequired(req)) {
          next();
          return;
        }
        const userIsLoggedIn = await verifyUserSession(req);
        if (userIsLoggedIn) {
          next();
          return;
        }
        const params = new URLSearchParams({
          continue: req.originalUrl,
        });
        res.redirect(`/cms/login?${params.toString()}`);
      });

      // Render the CMS SPA.
      server.use('/cms', async (req: Request, res: Response) => {
        try {
          const app = await getRenderer(req);
          await app.renderApp(req, res, {
            rootConfig: req.rootConfig,
            cmsConfig: options,
            firebaseConfig: options.firebaseConfig,
          });
        } catch (err) {
          // TODO(stevenle): render a custom error page.
          console.error(err);
          res.status(500).send('UNKNOWN SERVER ERROR');
        }
      });
    },
  };
}

function fileExists(filepath: string): Promise<boolean> {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}
