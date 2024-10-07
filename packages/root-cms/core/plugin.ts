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
import {
  App,
  applicationDefault,
  getApp,
  initializeApp,
} from 'firebase-admin/app';
import {getAuth, DecodedIdToken} from 'firebase-admin/auth';
import {Firestore, getFirestore} from 'firebase-admin/firestore';
import * as jsonwebtoken from 'jsonwebtoken';
import sirv from 'sirv';
import {generateTypes} from '../cli/generate-types.js';
import {api} from './api.js';
import {Action, RootCMSClient} from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AppModule = typeof import('./app.js');

// The session key name used for Root CMS authentication.
const SESSION_COOKIE_AUTH = 'root-cms-auth';

export interface CMSUser {
  email: string;
}

export interface CMSAIConfig {
  /** Custom API endpoint for chat prompts. */
  endpoint?: string;
  /** Gen AI model to use. Defaults to 'gemini-1.5-flash'. */
  model?: 'gemini-1.5-flash' | 'gemini-1.5-pro';
}

export interface CMSSidebarTool {
  /** URL for the sidebar icon image. */
  icon?: string;
  /** Label. */
  label?: string;
  /** Iframe URL to render for the tool. */
  iframeUrl?: string;
}

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
    [key: string]: string | undefined;
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    databaseId?: string;
  };

  /**
   * GAPI credentials. Include if using Google Drive and Google Sheets features.
   * See: https://developers.google.com/sheets/api/quickstart/js
   */
  gapi?: {
    /** https://developers.google.com/sheets/api/quickstart/js#create_an_api_key */
    apiKey: string;
    /** https://developers.google.com/sheets/api/quickstart/js#authorize_credentials_for_a_web_application */
    clientId: string;
  };

  /**
   * Secret value(s) used for signing the user authentication cookie.
   * @deprecated This is now handled directly by root's sessionMiddleware under
   * `server.sessionCookieSecret` in root.config.ts.
   */
  cookieSecret?: string | string[];

  /** Function called to check if a user should have access to the CMS. */
  isUserAuthorized?: (
    req: Request,
    user: CMSUser
  ) => boolean | Promise<boolean>;

  /**
   * Function to call to check if login is required for a particular request.
   */
  isLoginRequired?: (req: Request) => boolean;

  /**
   * By default, iframing the CMS is disallowed. Setting this value will allow
   * iframes from the specified origins. Example:
   * ```
   * allowedIframeOrigins: ['https://app.example.com']
   * ```
   */
  allowedIframeOrigins?: string[];

  /**
   * URL to GCI service for transforming uploaded GCS images to a Google App
   * Engine Images API serving URL.
   *
   * Setting this to `true` uses the default hosted service at
   * https://gci.rootjs.dev.
   *
   * To set up GCI:
   *
   * - Create a GCS bucket with fine-grained permissions
   * - Share owner access to the bucket with the service account returned in
   *   https://gci.rootjs.dev/_/service_account
   *
   * To disable GCI, leave this value empty or set to `false`, which which will
   * serve images directly from GCS instead.
   */
  gci?: string | boolean;

  /**
   * Customization options for the CMS sidebar.
   */
  sidebar?: {
    /**
     * Sidebar tools, a map of the sidebar id to config options. The sidebar
     * tool is url-mapped to `/cms/tools/:id` and displays the tool in an
     * iframe.
     */
    tools?: Record<string, CMSSidebarTool>;
  };

  /**
   * Callback when an action occurs.
   */
  onAction?: (action: Action) => any;

  /**
   * Experimental config options. Note: these are subject to change at any time.
   */
  experiments?: {
    ai?: boolean | CMSAIConfig;
  };

  /**
   * Adjust console output verbosity. Default is `'info'`.
   */
  logLevel?: 'info' | 'warn' | 'error' | 'silent' | 'debug';

  /**
   * Whether to enable/disable file watching in dev (e.g. for generating
   * `root-cms.d.ts`). Defaults to `true`.
   */
  watch?: boolean;
};

export type CMSPlugin = Plugin & {
  name: 'root-cms';
  getConfig: () => CMSPluginOptions;
  getFirebaseApp: () => App;
  getFirestore: () => Firestore;
};

function isExpired(decodedIdToken: DecodedIdToken) {
  const ts = Math.floor(new Date().getTime() / 1000);
  return ts >= decodedIdToken.exp;
}

function getFirebaseApp(gcpProjectId: string): App {
  const appName = 'root-cms';
  try {
    return getApp(appName);
  } catch (err) {
    if (err && err.code === 'app/no-app') {
      return initializeApp(
        {
          projectId: gcpProjectId,
          credential: applicationDefault(),
        },
        appName
      );
    }
    throw err;
  }
}

export function cmsPlugin(options: CMSPluginOptions): CMSPlugin {
  const logLevel = options.logLevel || 'info';

  if (!options.firebaseConfig) {
    throw new Error(
      'missing firebaseConfig. create a new app in the firebase admin console and copy the firebase config object to root.config.ts'
    );
  }

  const firebaseConfig = options.firebaseConfig || {};
  const app = getFirebaseApp(firebaseConfig.projectId);
  const auth = getAuth(app);

  /**
   * Checks if login is required for the request. Currently returns `true` if
   * the URL path starts with /cms or if ?preview=true is in the URL.
   */
  function loginRequired(req: Request): boolean {
    const urlPath = String(req.originalUrl).split('?')[0].toLowerCase();
    // Allow the cron to run unauthenticated. The cron job is responsible
    // for saving version history.
    if (urlPath === '/cms/api/cron.run') {
      return false;
    }
    // Allow the signin.css and signin.js files to be rendered without auth.
    if (
      urlPath === '/cms/static/signin.css' ||
      urlPath === '/cms/static/signin.js'
    ) {
      return false;
    }
    // Require login on all `/cms/` paths.
    if (urlPath.startsWith('/cms')) {
      return true;
    }
    // Require login on all paths that have `?preview=true`, which is used by
    // the preview iframe to render the preview for a page.
    if (String(req.query.preview) === 'true') {
      return true;
    }
    if (options.isLoginRequired && options.isLoginRequired(req)) {
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
  async function verifyUserLogin(
    req: Request
  ): Promise<{authorized: boolean; reason?: string}> {
    const idToken = req.body?.idToken;
    if (!idToken) {
      console.log('login failed: no id token');
      return {authorized: false, reason: 'no token'};
    }

    let user: CMSUser;

    // On local dev, simply verify the decoded idToken's email is set. The
    // identity toolkit that verifies id tokens requires a service account,
    // which we want to avoid having to set up when users are doing local dev.
    // Authentication is still required by the frontend using Firebase Auth,
    // this just bypasses the initial server check before the ui is rendered.
    try {
      if (process.env.NODE_ENV === 'development') {
        const jwt = jsonwebtoken.decode(idToken) as jsonwebtoken.JwtPayload;
        if (!jwt.email || !jwt.email_verified) {
          console.log('login failed: email unverified');
          return {authorized: false, reason: 'login failed'};
        }
        user = {email: jwt.email};
      } else {
        const jwt = await auth.verifyIdToken(idToken, true);
        if (isExpired(jwt)) {
          console.log('login failed: id token is expired');
          return {authorized: false, reason: 'login failed'};
        }
        if (!jwt.email || !jwt.email_verified) {
          console.log('login failed: email unverified');
          return {authorized: false, reason: 'login failed'};
        }
        user = {email: jwt.email};
      }

      // Verify the project's `isUserAuthorized()` config option.
      if (options.isUserAuthorized) {
        const authorized = await options.isUserAuthorized(req, {
          email: user.email,
        });
        if (!authorized) {
          console.log('login failed: user is not authorized');
          return {authorized: false, reason: 'not authorized'};
        }
      }

      // Verify the user exists in the DB's ACL list.
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const userHasAccess = await cmsClient.userExistsInAcl(user.email);
      if (!userHasAccess) {
        console.log('login failed: user is not in the firestore acl list');
        return {authorized: false, reason: 'not authorized'};
      }
    } catch (err) {
      console.error('failed to verify jwt token');
      console.error(err);
      return {authorized: false, reason: 'unknown error'};
    }

    return {authorized: true};
  }

  /**
   * Returns the current user based on the request's session cookie. The
   * session cookie is checked for validity through Firebase Auth and the user's
   * email is verified to have access to Root CMS, otherwise returns `null`.
   */
  async function getCurrentUser(req: Request): Promise<CMSUser | null> {
    const sessionCookie = req.session.getItem(SESSION_COOKIE_AUTH);
    if (!sessionCookie) {
      if (logLevel === 'debug') {
        console.log('no login session cookie');
      }
      return null;
    }

    // On local dev, verify the decoded idToken has a valid email. The firebase
    // auth verification otherwise would require a service account.
    if (process.env.NODE_ENV === 'development') {
      const jwt = jsonwebtoken.decode(sessionCookie) as jsonwebtoken.JwtPayload;
      if (!jwt?.email || !jwt?.email_verified) {
        return null;
      }
      // Check whether user is authorized.
      if (options.isUserAuthorized) {
        const authorized = await options.isUserAuthorized(req, {
          email: jwt.email,
        });
        if (!authorized) {
          console.log('session failed: not authorized');
          return null;
        }
      }
      // Verify the user exists in the DB's ACL list.
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const userHasAccess = await cmsClient.userExistsInAcl(jwt.email);
      if (!userHasAccess) {
        console.log('session failed: user is not in the firestore acl list');
        return null;
      }
      return {email: jwt.email};
    }

    try {
      // Verify the idToken using firebase auth, checking for token revocations.
      const jwt = await auth.verifySessionCookie(sessionCookie, true);
      if (isExpired(jwt)) {
        console.log('session failed: token is expired');
        return null;
      }
      // Verify user's email is verified.
      if (!jwt.email || !jwt.email_verified) {
        console.log('session failed: email not verified');
        return null;
      }
      // Check whether user is authorized.
      if (options.isUserAuthorized) {
        const authorized = await options.isUserAuthorized(req, {
          email: jwt.email!,
        });
        if (!authorized) {
          console.log('session failed: not authorized');
          return null;
        }
      }
      // Verify the user exists in the DB's ACL list.
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const userHasAccess = await cmsClient.userExistsInAcl(jwt.email);
      if (!userHasAccess) {
        console.log('session failed: user is not in the firestore acl list');
        return null;
      }
      // JWT verified.
      return {email: jwt.email!};
    } catch (err) {
      console.error('failed to verify jwt token');
      console.error(err);
      return null;
    }
  }

  function redirectToLogin(req: Request, res: Response) {
    if (String(req.originalUrl).toLowerCase().startsWith('/cms/api')) {
      res.status(401).json({success: false, error: 'NOT_AUTHORIZED'});
      return;
    }
    console.log('redirecting to login page');
    const params = new URLSearchParams({
      continue: req.originalUrl,
    });
    res.redirect(`/cms/login?${params.toString()}`);
  }

  const plugin: CMSPlugin = {
    name: 'root-cms',

    /**
     * Returns the config options passed to the plugin.
     */
    getConfig: () => {
      return options;
    },

    /**
     * Returns the Firebase App instance used by the plugin.
     */
    getFirebaseApp: () => {
      return app;
    },

    /**
     * Returns the Firestore instance used by the plugin.
     */
    getFirestore: () => {
      const databaseId = firebaseConfig.databaseId || '(default)';
      return getFirestore(app, databaseId);
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

      // Login handler.
      server.use('/cms/login', async (req: Request, res: Response) => {
        if (
          req.method === 'PUT' &&
          req.headers['content-type'] === 'application/json'
        ) {
          try {
            const {authorized, reason} = await verifyUserLogin(req);
            if (!authorized) {
              res
                .status(401)
                .json({success: false, error: 'NOT_AUTHORIZED', reason});
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
            res.session.setItem(SESSION_COOKIE_AUTH, sessionCookie);
            res.saveSession();
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
          app.renderSignIn(req, res, {
            rootConfig: req.rootConfig!,
            cmsConfig: options,
          });
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
        res.session.removeItem(SESSION_COOKIE_AUTH);
        res.saveSession();
        res.redirect('/cms/login');
      });

      // Inject the current user into the req object and check if login is
      // required, sending unauthenticated users to the login page.
      server.use(async (req: Request, res: Response, next: NextFunction) => {
        const user = await getCurrentUser(req);
        if (user) {
          req.user = user;
        }

        // If no user and login is required for the given path, redirect to the
        // login page.
        if (!user && loginRequired(req)) {
          redirectToLogin(req, res);
          return;
        }

        next();
      });

      const staticDir = path.resolve(__dirname, 'ui');
      server.use('/cms/static', sirv(staticDir, {dev: false}));

      // Register API handlers.
      api(server);

      // Render the CMS SPA.
      server.use('/cms', async (req: Request, res: Response) => {
        try {
          // Enforce login for all CMS paths. The `req.user` would only be
          // populated if the firebase auth token is valid and the user has
          // access via the Root CMS sharebox.
          if (!req.user) {
            redirectToLogin(req, res);
            return;
          }
          const app = await getRenderer(req);
          await app.renderApp(req, res, {
            rootConfig: req.rootConfig!,
            cmsConfig: options,
          });
        } catch (err) {
          // TODO(stevenle): render a custom error page.
          console.error(err);
          res.status(500).send('UNKNOWN SERVER ERROR');
        }
      });
    },
  };

  if (options.watch !== false) {
    plugin.onFileChange = (
      eventName: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir',
      filepath: string
    ) => {
      if (filepath.endsWith('.schema.ts')) {
        // Avoid loading the `generate-types.js` module if it is not needed.
        // See: https://github.com/blinkk/rootjs/issues/426
        import('../cli/generate-types.js').then((generateTypesModule) => {
          const generateTypes = generateTypesModule.generateTypes;
          generateTypes();
        });
      }
    };
  }

  return plugin;
}

function fileExists(filepath: string): Promise<boolean> {
  return fs
    .access(filepath)
    .then(() => true)
    .catch(() => false);
}
