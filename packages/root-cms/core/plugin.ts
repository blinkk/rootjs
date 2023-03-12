import {NextFunction, Plugin, Request, Response} from '@blinkk/root';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import firebase from 'firebase-admin';
import bodyParser from 'body-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const SESSION_COOKIE = '_rootjs_cms';

export type CMSUser = firebase.auth.DecodedIdToken;

export type CMSPluginOptions = {
  /** Firebase config object, which can be obtained in the Firebase Console by going to "Project Settings" */
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

function isExpired(decodedIdToken: firebase.auth.DecodedIdToken) {
  const ts = new Date().getTime() / 1000;
  return ts - decodedIdToken.auth_time > 5 * 60;
}

export function cmsPlugin(options: CMSPluginOptions): Plugin {
  const firebaseConfig = options.firebaseConfig;
  const cookieSecret = options.cookieSecret || generateSecret();
  const app = firebase.initializeApp({
    projectId: firebaseConfig.projectId,
    credential: firebase.credential.applicationDefault(),
  });
  const auth = firebase.auth(app);

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
    configureServer: (server) => {
      server.use('/cms', cookieParser(cookieSecret));
      server.use('/cms', bodyParser.json());

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
            const sessionCookie = await auth.createSessionCookie(idToken, {
              expiresIn,
            });
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
          const appPath = path.resolve(__dirname, './app.js');
          const app = await req.viteServer!.ssrLoadModule(appPath);
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
      server.use(
        '/cms',
        async (req: Request, res: Response, next: NextFunction) => {
          const userIsLoggedIn = await verifyUserSession(req);
          if (userIsLoggedIn) {
            next();
            return;
          }
          const params = new URLSearchParams({
            continue: req.originalUrl,
          });
          res.redirect(`/cms/login?${params.toString()}`);
        }
      );

      // Render the CMS SPA.
      server.use('/cms', async (req: Request, res: Response) => {
        try {
          const appPath = path.resolve(__dirname, './app.js');
          const app = await req.viteServer!.ssrLoadModule(appPath);
          await app.renderApp(req, res, {
            rootConfig: req.rootConfig,
            firebaseConfig: options.firebaseConfig,
          });
        } catch (err) {
          console.error(err);
          res.status(500).send('UNKNOWN SERVER ERROR');
        }
      });
    },
  };
}