import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Request, Response} from '@blinkk/root';

/**
 * A dev-only login session shared by every Root project running on localhost.
 *
 * Root's `__session` cookie is signed with a per-project secret, so switching
 * between local sites (or restarting on a different project) invalidates the
 * cookie and forces a fresh sign-in each time. Since cookies ignore the port,
 * this module stores the CMS auth token in its own cookie signed with a
 * machine-local secret, letting every local Root project reuse the same login.
 *
 * This only ever runs when `NODE_ENV === 'development'`; production sessions
 * are untouched. Access is still authorized per project: the token is only
 * used to identify the user, and the project's `isUserAuthorized()` config and
 * Firestore ACL are checked on every request. Set `ROOT_CMS_DEV_SHARED_AUTH=0`
 * to opt out.
 */

/** Cookie holding the dev login shared across local Root projects. */
const DEV_AUTH_COOKIE = 'root-cms-dev-auth';

/** How long a shared dev login lasts (5 days, matching the CMS session). */
const DEV_AUTH_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000;

/** Directory holding the machine-local secret. */
const DEV_SECRET_DIR = '.root-cms';

/** File holding the machine-local secret used to sign the dev auth cookie. */
const DEV_SECRET_FILE = 'dev-session-secret';

/** Request with the cookies parsed by `cookie-parser`. */
type RequestWithCookies = Request & {cookies?: Record<string, string>};

interface DevAuthPayload {
  /** The Firebase ID token identifying the signed-in user. */
  token: string;
  /** Expiration timestamp, in millis. */
  exp: number;
}

let cachedSecret: string | null = null;

/**
 * Returns true if the shared dev login is enabled. Only enabled during local
 * development, and can be disabled with `ROOT_CMS_DEV_SHARED_AUTH=0`.
 */
export function isDevSharedAuthEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }
  const flag = String(process.env.ROOT_CMS_DEV_SHARED_AUTH || '').toLowerCase();
  return flag !== '0' && flag !== 'false';
}

/**
 * Returns the machine-local secret used to sign the dev auth cookie, creating
 * it on first use. The secret is persisted to the user's home directory so it
 * survives server restarts and is shared by every local Root project. If the
 * file can't be read or written (e.g. a read-only home directory), a
 * process-local secret is used instead, which degrades to the previous
 * behavior of signing in once per server process.
 */
function getDevSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }
  const secretDir = path.join(os.homedir(), DEV_SECRET_DIR);
  const secretPath = path.join(secretDir, DEV_SECRET_FILE);
  try {
    const secret = fs.readFileSync(secretPath, 'utf-8').trim();
    if (secret) {
      cachedSecret = secret;
      return secret;
    }
  } catch {
    // Fall through and create the secret below.
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(secretDir, {recursive: true, mode: 0o700});
    fs.writeFileSync(secretPath, secret, {encoding: 'utf-8', mode: 0o600});
  } catch {
    console.warn(
      `[root cms] unable to save the dev session secret to ${secretPath}, ` +
        'the CMS login will not be shared across local projects'
    );
  }
  cachedSecret = secret;
  return secret;
}

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/** Serializes and signs a dev auth cookie value. */
export function encodeDevAuthCookie(
  idToken: string,
  secret: string,
  now = Date.now()
): string {
  const payload: DevAuthPayload = {
    token: idToken,
    exp: now + DEV_AUTH_MAX_AGE_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString(
    'base64url'
  );
  return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Verifies a dev auth cookie value and returns the ID token it holds, or
 * `null` if the value was tampered with or has expired.
 */
export function decodeDevAuthCookie(
  value: string,
  secret: string,
  now = Date.now()
): string | null {
  const index = value.lastIndexOf('.');
  if (index <= 0) {
    return null;
  }
  const encoded = value.slice(0, index);
  const signature = value.slice(index + 1);
  const expected = sign(encoded, secret);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload: DevAuthPayload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    );
    if (!payload?.token || !payload.exp || payload.exp < now) {
      return null;
    }
    return payload.token;
  } catch {
    return null;
  }
}

/** Saves the shared dev login to a cookie. */
export function setDevAuthCookie(res: Response, idToken: string) {
  if (!isDevSharedAuthEnabled()) {
    return;
  }
  res.cookie(DEV_AUTH_COOKIE, encodeDevAuthCookie(idToken, getDevSecret()), {
    maxAge: DEV_AUTH_MAX_AGE_MS,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  });
}

/** Returns the ID token from the shared dev login, if any. */
export function getDevAuthCookie(req: Request): string | null {
  if (!isDevSharedAuthEnabled()) {
    return null;
  }
  const value = (req as RequestWithCookies).cookies?.[DEV_AUTH_COOKIE];
  if (!value || typeof value !== 'string') {
    return null;
  }
  return decodeDevAuthCookie(value, getDevSecret());
}

/** Clears the shared dev login. */
export function clearDevAuthCookie(res: Response) {
  // Not gated on `isDevSharedAuthEnabled()` so that a cookie saved before the
  // feature was turned off is still cleared on sign out.
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  res.clearCookie(DEV_AUTH_COOKIE, {path: '/'});
}
