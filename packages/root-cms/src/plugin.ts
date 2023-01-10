import {Plugin, Request, Response} from '@blinkk/root';
import {User, usersMiddleware} from './users';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';

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
  return {
    name: 'root-cms',
    configureServer: (server) => {
      server.use(
        '/cms',
        cookieParser(options?.cookieSecret || generateSecret())
      );
      server.use(
        '/cms',
        usersMiddleware({
          isLoginRequired: () => true,
          isUserAuthorized: options?.isUserAuthorized,
        })
      );
      server.use('/cms', async (req: Request, res: Response) => {
        console.log('root config context var:');
        console.log(req.rootConfig);
        res.end('cms');
      });
    },
  };
}
