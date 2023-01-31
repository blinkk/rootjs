import {NextFunction, Plugin, Request, Response} from '@blinkk/root';
import {User, usersMiddleware} from './users.js';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

export type CMSPluginOptions = {
  // Secret value(s) used for signing the user authentication cookie.
  cookieSecret?: string | string[];
  // Function called to check if a user should have access to the CMS.
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

export function cmsPlugin(options?: CMSPluginOptions): Plugin {
  const cookieSecret = options?.cookieSecret || generateSecret();
  return {
    name: 'root-cms',
    configureServer: (server) => {
      server.use('/cms', cookieParser(cookieSecret));
      server.use(
        '/cms',
        usersMiddleware({
          isLoginRequired: () => true,
          isUserAuthorized: options?.isUserAuthorized,
        })
      );
      // server.use('/cms/main.js', async (req: Request, res: Response) => {
      //   const viteServer = req.viteServer!;
      //   const appPath = path.resolve(__dirname, './app.js');
      //   const fileUrl = path.join('/@fs', appPath.slice(1));
      //   console.log(fileUrl);
      //   const val = await viteServer.transformRequest(
      //     path.join('/@fs', appPath.slice(1))
      //   );
      //   if (val?.code) {
      //     res.setHeader('content-type', 'text/plain');
      //     res.send(val.code);
      //   } else {
      //     res.send('not found');
      //   }
      // });
      server.use(
        '/cms',
        async (req: Request, res: Response, next: NextFunction) => {
          try {
            const appPath = path.resolve(__dirname, './app.js');
            const app = await req.viteServer!.ssrLoadModule(appPath);
            app.render(req, res);
          } catch (err) {
            console.error(err);
            next(err);
          }
        }
      );
    },
  };
}
