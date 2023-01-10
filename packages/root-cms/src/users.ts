import {NextFunction, Request, Response} from '@blinkk/root';
import axios from 'axios';
import jsonwebtoken from 'jsonwebtoken';

export interface User {
  email: string;
  jwt: any;
}

export type UserRequest = Request & {
  user?: User | null;
};

export interface MiddlewareOptions {
  isLoginRequired?: (req: Request) => boolean;
  isUserAuthorized?: (req: Request, user: User) => boolean | Promise<boolean>;
  loginUrl?: string;
}

const USER_COOKIE = 'ROOTJS_USER';

export function usersMiddleware(options: MiddlewareOptions) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const loginUrl = options.loginUrl || '/cms/login';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing one or more required .env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET'
    );
  }

  function isLoginRequired(req: Request) {
    if (!options.isLoginRequired) {
      return false;
    }
    return options.isLoginRequired(req);
  }

  function isUserAuthorized(req: Request, user: User) {
    if (!options.isUserAuthorized) {
      return true;
    }
    return options.isUserAuthorized(req, user);
  }

  function getLoginUrl(req: Request) {
    const params = new URLSearchParams();
    params.set('scope', 'email');
    params.set('access_type', 'online');
    params.set('client_id', clientId);
    params.set('redirect_uri', getRedirectUrl(req));
    params.set('state', req.originalUrl);
    params.set('response_type', 'code');
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  function getRedirectUrl(req: Request) {
    const host = getHost(req);
    const protocol = req.protocol;
    return `${protocol}://${host}${loginUrl}`;
  }

  function getHost(req: Request) {
    return req.headers['x-forwarded-host'] || req.headers.host;
  }

  function loginRedirect(req: Request, res: Response) {
    const loginUrl = getLoginUrl(req);
    res.redirect(loginUrl);
    return;
  }

  async function getOAuthToken(req: Request, code: string) {
    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('redirect_uri', getRedirectUrl(req));
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    const res = await axios({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: params.toString(),
    });
    if (res.status !== 200) {
      console.error(res.status);
      throw new Error('failed to retrieve jwt token');
    }
    return res.data;
  }

  async function getUser(req: Request): Promise<User | null> {
    const cookieValue = req.signedCookies[USER_COOKIE];
    console.log(cookieValue);
    if (cookieValue) {
      try {
        const jwt = JSON.parse(cookieValue);
        if (jwt.email) {
          return {
            email: jwt.email,
            jwt: jwt,
          };
        }
      } catch (e) {
        console.error(`failed to parse cookie: ${cookieValue}`);
        console.error(e);
      }
    }
    return null;
  }

  async function handleLogin(req: Request, res: Response) {
    const code = req.query.code as string;
    if (!code) {
      res.status(403).send('Missing required param: code');
      return;
    }
    const token = await getOAuthToken(req, code);
    const jwt = decodeJWT(token.id_token);
    if (!jwt || !jwt.email || !jwt.email_verified) {
      res.status(500).send('500: Login failed');
      return;
    }
    const exp = jwt.exp || Math.floor(new Date().getTime() / 1000 + 3600);
    res.cookie(USER_COOKIE, JSON.stringify(jwt), {
      secure: req.hostname !== 'localhost',
      httpOnly: true,
      sameSite: true,
      expires: new Date(exp * 1000),
      signed: true,
    });
    const state = String(req.params.state);
    if (state && state.startsWith('/cms')) {
      res.redirect(state);
    } else {
      res.redirect('/cms');
    }
  }

  function decodeJWT(token: string) {
    try {
      const decoded = jsonwebtoken.decode(token, {complete: true});
      return decoded?.payload as jsonwebtoken.JwtPayload;
    } catch (err) {
      return null;
    }
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith(loginUrl)) {
      await handleLogin(req, res);
      return;
    }
    const user = await getUser(req);
    if (isLoginRequired(req)) {
      if (!user) {
        loginRedirect(req, res);
        return;
      }
      if (!isUserAuthorized(req, user)) {
        res.status(403).send('403: Login failed');
        return;
      }
    }
    const r = req as UserRequest;
    r.user = user;
    next();
  };
}
