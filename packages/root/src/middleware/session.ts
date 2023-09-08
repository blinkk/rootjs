import {NextFunction, Request, Response} from '../core/types';

export const SESSION_COOKIE = '__session';

// 5 days.
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 5 * 1000;

export interface SessionMiddlewareOptions {
  maxAge?: number;
}

/**
 * Middleware for storing session data stored in an http cookie called
 * `__session`. This cookie is compatible with Firebase Hosting:
 * https://firebase.google.com/docs/hosting/manage-cache#using_cookies
 */
export function sessionMiddleware(options?: SessionMiddlewareOptions) {
  const maxAge = options?.maxAge || DEFAULT_MAX_AGE;
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieValue = String(req.signedCookies[SESSION_COOKIE] || '');
    const session = Session.fromCookieValue(cookieValue);
    req.session = session;
    res.session = session;
    res.saveSession = () => {
      // "secure" cookies require https, so disable "secure" when in development.
      const secureCookie = Boolean(process.env.NODE_ENV !== 'development');
      const cookieValue = session.toString();
      res.cookie(SESSION_COOKIE, cookieValue, {
        maxAge: maxAge,
        httpOnly: true,
        secure: secureCookie,
        signed: true,
        sameSite: 'strict',
      });
    };
    req.hooks.add('beforeRender', () => {
      res.saveSession();
    });
    next();
  };
}

export class Session {
  private data: Record<string, string> = {};

  constructor(data?: Record<string, string>) {
    this.data = data || {};
  }

  static fromCookieValue(cookieValue: string) {
    const data: Record<string, string> = {};
    try {
      const params = new URLSearchParams(base64Decode(cookieValue));
      for (const [key, value] of params.entries()) {
        data[key] = value;
      }
    } catch (err) {
      console.warn('failed to parse session cookie:', err);
      return new Session();
    }
    return new Session(data);
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.data[key] = value;
  }

  removeItem(key: string) {
    delete this.data[key];
  }

  toString(): string {
    const params = new URLSearchParams(this.data);
    return base64Encode(params.toString());
  }
}

function base64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function base64Decode(str: string): string {
  return Buffer.from(str, 'base64').toString('utf-8');
}
