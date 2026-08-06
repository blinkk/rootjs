/**
 * @fileoverview Google OAuth (GIS) access tokens for browser features that
 * call Google APIs directly.
 *
 * The CMS never stores a Google credential server-side: each user signs in
 * with their own Google account, so a user can only read the Drive files and
 * spreadsheets they personally have access to. The token lives in memory
 * (it expires after ~1 hour); only the record of which scopes the user has
 * consented to is persisted, in localStorage, so repeat sign-ins can skip the
 * consent dialog.
 *
 * The consent record is shared with `useGapiClient` (same localStorage key and
 * base scopes), so consenting once covers the gapi-based features (Drive file
 * picker, Sheets export), the Drive asset sync provider, and the Root AI
 * Google tools.
 */

import {loadGisScript} from '../hooks/useGapiClient.js';

/** Read access to files the user can open in Drive (incl. Docs exports). */
export const GOOGLE_DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly';

/**
 * Scopes requested at sign-in. Includes the same base scopes as
 * `useGapiClient` so a single consent covers every Google feature in the CMS.
 */
export const GOOGLE_LOGIN_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  GOOGLE_DRIVE_READONLY_SCOPE,
];

/** Seconds of remaining lifetime below which a cached token is refreshed. */
const TOKEN_EXPIRY_SKEW_SECONDS = 30;

/** Max time to wait on a promptless token request before giving up. */
const SILENT_REQUEST_TIMEOUT_MS = 30000;

/** The user's Google consent record, shared with `useGapiClient`. */
interface GapiUserConsent {
  clientId?: string;
  scopes?: string[];
  at?: number;
}

let cachedToken: {accessToken: string; expiresAt: number} | null = null;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getConsentStorageKey(): string {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return `root-cms::${projectId}::gapi-user-consent`;
}

function readUserConsent(): GapiUserConsent | null {
  try {
    const raw = localStorage.getItem(getConsentStorageKey());
    return raw ? (JSON.parse(raw) as GapiUserConsent) : null;
  } catch {
    return null;
  }
}

function writeUserConsent(consent: GapiUserConsent) {
  try {
    localStorage.setItem(getConsentStorageKey(), JSON.stringify(consent));
  } catch {
    // localStorage may be unavailable; consent is simply not remembered.
  }
}

/** Whether the project configured `gapi: {apiKey, clientId}` on cmsPlugin. */
export function isGoogleApiEnabled(): boolean {
  const gapi = window.__ROOT_CTX.gapi;
  return Boolean(gapi?.apiKey && gapi?.clientId);
}

/** Whether the user has already consented to `scopes` for this client id. */
export function hasGoogleConsent(
  scopes: string[] = GOOGLE_LOGIN_SCOPES
): boolean {
  const clientId = window.__ROOT_CTX.gapi?.clientId;
  if (!clientId) {
    return false;
  }
  const consent = readUserConsent();
  if (!consent?.at || consent.clientId !== clientId) {
    return false;
  }
  const consented = consent.scopes || [];
  return scopes.every((scope) => consented.includes(scope));
}

/**
 * Returns a valid access token from memory, if any. Falls back to the token
 * held by the gapi client, which the GIS token flow sets automatically when a
 * different part of the CMS (e.g. `useGapiClient`) signed the user in — but
 * only when the user consented to the full scope list, since a token granted
 * for the base scopes alone cannot read arbitrary Drive files.
 */
export function getGoogleAccessToken(): string | null {
  if (
    cachedToken &&
    nowSeconds() < cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_SECONDS
  ) {
    return cachedToken.accessToken;
  }
  if (!hasGoogleConsent()) {
    return null;
  }
  const gapiToken = (window as any).gapi?.auth?.getToken?.();
  return gapiToken?.access_token || null;
}

/** Drops the cached token, e.g. after an API call returns 401. */
export function clearGoogleAccessToken() {
  cachedToken = null;
}

/**
 * Requests a Google access token via the GIS token flow.
 *
 * When `interactive` is false the request is only attempted if the user has
 * already consented to `GOOGLE_LOGIN_SCOPES` (Google can then issue a token
 * without showing UI); otherwise it rejects immediately. Interactive requests
 * must be called from a user gesture so the popup isn't blocked.
 */
export async function requestGoogleAccessToken(options?: {
  interactive?: boolean;
}): Promise<string> {
  const interactive = options?.interactive ?? false;
  const clientId = window.__ROOT_CTX.gapi?.clientId;
  if (!clientId) {
    throw new Error(
      'Google APIs are not configured. Add `gapi: {apiKey, clientId}` to the cmsPlugin options in root.config.ts.'
    );
  }
  const consented = hasGoogleConsent();
  if (!interactive && !consented) {
    throw new Error('Google access has not been granted yet.');
  }
  await loadGisScript();
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timeoutId = interactive
      ? null
      : setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('Timed out waiting for a Google access token.'));
          }
        }, SILENT_REQUEST_TIMEOUT_MS);
    const finish = (err: Error | null, token?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (err) {
        reject(err);
      } else {
        resolve(token!);
      }
    };

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_LOGIN_SCOPES.join(' '),
      callback: (token: any) => {
        if (!token || token.error || !token.access_token) {
          finish(
            new Error(
              `Google sign-in failed${token?.error ? `: ${token.error}` : '.'}`
            )
          );
          return;
        }
        cachedToken = {
          accessToken: token.access_token,
          expiresAt: nowSeconds() + Number(token.expires_in || 3600),
        };
        writeUserConsent({
          at: nowSeconds(),
          clientId: clientId,
          scopes: GOOGLE_LOGIN_SCOPES,
        });
        finish(null, token.access_token);
      },
      error_callback: (err: any) => {
        finish(new Error(err?.message || 'Google sign-in was cancelled.'));
      },
    });
    // Skip the account chooser and consent dialog when the user has already
    // consented to these scopes.
    tokenClient.requestAccessToken({prompt: consented ? '' : 'consent'});
  });
}

/**
 * Returns a usable Google access token, requesting a new one when the cached
 * token is missing or expired. Non-interactive by default: pass
 * `{interactive: true}` from a user gesture (e.g. a click) when it's okay to
 * show the Google sign-in popup.
 */
export async function ensureGoogleAccessToken(options?: {
  interactive?: boolean;
}): Promise<string> {
  const token = getGoogleAccessToken();
  if (token) {
    return token;
  }
  return await requestGoogleAccessToken(options);
}
