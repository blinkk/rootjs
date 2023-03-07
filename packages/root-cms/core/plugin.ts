import {NextFunction, Plugin, Request, Response} from '@blinkk/root';
import {User, UserRequest, usersMiddleware} from './users.js';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import firebase from 'firebase-admin';
import bodyParser from 'body-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const SESSION_COOKIE = '_rootjs_cms';

export type CMSPluginOptions = {
  /** The Root.js project ID. */
  id: string;
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
  isUserAuthorized?: (req: Request, user: User) => boolean | Promise<boolean>;
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
  return {
    name: 'root-cms',
    configureServer: (server) => {
      server.use('/cms', cookieParser(cookieSecret));
      server.use('/cms', bodyParser.json());

      // Login handler.
      server.use('/cms/login', async (req: Request, res: Response) => {
        try {
          if (
            req.method === 'PUT' &&
            req.headers['content-type'] === 'application/json'
          ) {
            const data = req.body as {idToken: string};
            const idToken = data.idToken;

            // Verify the idToken.
            const decodedIdToken = await auth.verifyIdToken(idToken, true);
            if (isExpired(decodedIdToken)) {
              res.status(401).json({success: false, error: 'EXPIRED'});
              return;
            }

            if (!decodedIdToken.email || !decodedIdToken.email_verified) {
              res.status(401).json({success: false, error: 'UNAUTHORIZED'});
              return;
            }

            const user = {email: decodedIdToken.email, jwt: decodedIdToken};
            if (
              options.isUserAuthorized &&
              !(await options.isUserAuthorized(req, user))
            ) {
              res.status(401).json({success: false, error: 'UNAUTHORIZED'});
              return;
            }

            // Set session expiration to 5 days.
            const expiresIn = 60 * 60 * 24 * 5 * 1000;
            const sessionCookie = await auth.createSessionCookie(idToken, {
              expiresIn,
            });
            res.cookie(SESSION_COOKIE, sessionCookie, {
              maxAge: expiresIn,
              httpOnly: true,
              secure: true,
            });
            res.json({success: true});
          } else {
            const appPath = path.resolve(__dirname, './app.js');
            const app = await req.viteServer!.ssrLoadModule(appPath);
            app.renderSignIn(req, res, options);
          }
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
        async (req: UserRequest, res: Response, next: NextFunction) => {
          const sessionCookie = req.cookies[SESSION_COOKIE] || '';
          if (sessionCookie) {
            try {
              const decodedClaims = await auth.verifySessionCookie(
                sessionCookie,
                true
              );
              if (decodedClaims?.email && decodedClaims.email_verified) {
                req.user = {
                  email: decodedClaims.email,
                  jwt: decodedClaims,
                };
                next();
                return;
              }
            } catch (err) {
              console.error('failed to decode session cookie');
            }
          }
          const params = new URLSearchParams({
            continue: req.originalUrl,
          });
          res.redirect(`/cms/login?${params.toString()}`);
        }
      );

      // Render the CMS SPA.
      server.use(
        '/cms',
        async (req: Request, res: Response, next: NextFunction) => {
          try {
            const appPath = path.resolve(__dirname, './app.js');
            const app = await req.viteServer!.ssrLoadModule(appPath);
            app.renderApp(req, res, options);
          } catch (err) {
            console.error(err);
            next(err);
          }
        }
      );
    },
  };
}
