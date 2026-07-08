/**
 * @fileoverview Google Drive sync provider.
 *
 * Syncs the files of a Google Drive folder into an asset-library folder.
 * Auth uses the same Google OAuth (GIS) flow as the rest of the CMS
 * (`useGapiClient`), with the read-only Drive scope added -- the signed-in
 * user's own access decides which folders they can sync. Requires the
 * project to configure `gapi: {apiKey, clientId}` in the cmsPlugin options.
 *
 * Unlike Figma, Drive reports a per-file `md5Checksum` during enumeration,
 * so unchanged files are skipped without downloading. Drive has no cheap
 * folder-level version, so the engine's whole-sync fast path doesn't apply
 * (`RemoteAssetList.version` is left unset); a no-change re-sync costs one
 * listing call and zero downloads.
 *
 * Scope notes (v1): only the folder's direct children are synced (no
 * subfolder recursion), and native Google Docs/Sheets/Slides files are
 * skipped -- they have no binary content to import (exporting them to
 * PDF/XLSX is a possible future option).
 */

import {loadGisScript} from '../../hooks/useGapiClient.js';
import {sanitizeAssetName} from './names.js';
import {
  AssetSyncProvider,
  RemoteAsset,
  RemoteAssetList,
  SyncAccessError,
  SyncAuthContext,
  SyncProviderContext,
  SyncRateLimitError,
  SyncSourceRef,
  SyncTokenRequiredError,
} from './types.js';

const DRIVE_API_ORIGIN = 'https://www.googleapis.com';

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/**
 * Scopes requested at sign-in. Includes the same base scopes as
 * `useGapiClient` so a single consent covers both the asset sync and the
 * existing Drive/Sheets features (the consent cache is shared).
 */
const LOGIN_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  DRIVE_READONLY_SCOPE,
];

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** Native Google editors files (Docs/Sheets/...) have no binary content. */
const GOOGLE_APPS_MIME_PREFIX = 'application/vnd.google-apps';

/** Max retries for rate-limited API requests. */
const MAX_RATE_LIMIT_RETRIES = 3;

/** Max seconds to wait out a single Retry-After before retrying. */
const MAX_RETRY_WAIT_SECONDS = 120;

/** Files returned per files.list page. */
const LIST_PAGE_SIZE = 1000;

/** Download payload attached to each RemoteAsset. */
interface DriveAssetRef {
  mimeType?: string;
}

// The GIS access token is held in memory only (like the gapi client's own
// token handling) and expires after ~1 hour; a new sync after expiry
// re-runs the (usually promptless) sign-in.
let cachedToken: {accessToken: string; expiresAt: number} | null = null;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getCachedAccessToken(): string | null {
  if (cachedToken && nowSeconds() < cachedToken.expiresAt - 30) {
    return cachedToken.accessToken;
  }
  return null;
}

/**
 * The user's Google consent record, shared with `useGapiClient` (which
 * writes the same localStorage key via Mantine's useLocalStorage) so that
 * consenting once covers both features.
 */
interface GapiUserConsent {
  clientId?: string;
  scopes?: string[];
  at?: number;
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

/**
 * Interactively signs the user in with Google (GIS token flow) and caches
 * the access token in memory. Skips the consent dialog when the user has
 * previously consented to the requested scopes. Must be called from a user
 * gesture so the popup isn't blocked.
 */
async function driveInteractiveLogin(): Promise<void> {
  const clientId = window.__ROOT_CTX.gapi?.clientId;
  if (!clientId) {
    throw new Error(
      'Google Drive sync requires the CMS Google API config. Add `gapi: {apiKey, clientId}` to the cmsPlugin options in root.config.ts.'
    );
  }
  await loadGisScript();
  await new Promise<void>((resolve, reject) => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: LOGIN_SCOPES.join(' '),
      callback: (token: any) => {
        if (!token || token.error) {
          reject(
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
          scopes: LOGIN_SCOPES,
        });
        resolve();
      },
      error_callback: (err: any) => {
        reject(new Error(err?.message || 'Google sign-in was cancelled.'));
      },
    });
    const consent = readUserConsent();
    const promptless =
      consent?.clientId === clientId &&
      LOGIN_SCOPES.every((scope) => consent?.scopes?.includes(scope));
    tokenClient.requestAccessToken({prompt: promptless ? '' : 'consent'});
  });
}

function createAuthContext(): SyncAuthContext {
  return {
    async getToken() {
      const token = getCachedAccessToken();
      if (!token) {
        throw new SyncTokenRequiredError(
          'gdrive',
          'Sign in with Google to sync from Drive.'
        );
      }
      return token;
    },
    invalidateToken() {
      cachedToken = null;
    },
  };
}

/**
 * Parses a Google Drive folder URL into a folder id. Supported forms:
 *
 *   https://drive.google.com/drive/folders/<folderId>
 *   https://drive.google.com/drive/u/0/folders/<folderId>?usp=sharing
 *   https://drive.google.com/open?id=<folderId>
 */
export function parseDriveFolderUrl(url: string): {folderId: string} | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'drive.google.com') {
    return null;
  }
  let folderId: string;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const foldersIndex = parts.findIndex((p) => p === 'folders');
  if (foldersIndex !== -1 && parts[foldersIndex + 1]) {
    folderId = parts[foldersIndex + 1];
  } else if (parts[0] === 'open' && parsed.searchParams.get('id')) {
    folderId = parsed.searchParams.get('id')!;
  } else {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    return null;
  }
  return {folderId};
}

function isRateLimited(status: number, body: any): boolean {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  const reason = String(
    body?.error?.errors?.[0]?.reason || body?.error?.status || ''
  ).toLowerCase();
  return reason.includes('ratelimit') || reason.includes('resource_exhausted');
}

/**
 * Calls the Drive REST API, mapping auth failures to typed errors and
 * retrying rate-limited requests with a user-visible countdown (mirrors the
 * Figma provider's behavior). Returns the raw Response; callers parse.
 */
async function driveFetch(
  path: string,
  token: string,
  onStatus?: (message: string) => void
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${DRIVE_API_ORIGIN}${path}`, {
      headers: {Authorization: `Bearer ${token}`},
    });
    if (res.ok) {
      return res;
    }
    const body = await res
      .clone()
      .json()
      .catch(() => ({}));
    if (isRateLimited(res.status, body)) {
      attempt += 1;
      const retryAfter = Number(res.headers?.get?.('retry-after')) || 0;
      if (attempt > MAX_RATE_LIMIT_RETRIES) {
        throw new SyncRateLimitError(
          'Google Drive is rate-limiting API requests for your account. Wait a minute or two, then sync again — the sync picks up where it left off.',
          retryAfter || undefined
        );
      }
      const delaySeconds = Math.min(
        Math.max(retryAfter, 10 * attempt),
        MAX_RETRY_WAIT_SECONDS
      );
      for (let remaining = delaySeconds; remaining > 0; remaining--) {
        onStatus?.(
          `Google Drive rate limit reached — retrying in ${remaining}s… (attempt ${attempt} of ${MAX_RATE_LIMIT_RETRIES})`
        );
        await sleep(1000);
      }
      onStatus?.('Retrying…');
      continue;
    }
    if (res.status === 401) {
      cachedToken = null;
      throw new SyncTokenRequiredError(
        'gdrive',
        'Your Google session expired. Sign in again to continue.'
      );
    }
    if (res.status === 403) {
      throw new SyncAccessError(
        "Your Google account doesn't have access to this Drive folder."
      );
    }
    if (res.status === 404) {
      throw new SyncAccessError(
        'Drive folder not found. Check the URL, or ask for access to the folder.'
      );
    }
    const errMessage = String(body?.error?.message || '');
    throw new Error(
      `Google Drive API request failed (${res.status})${
        errMessage ? `: ${errMessage}` : ''
      }`
    );
  }
}

function sleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  md5Checksum?: string;
}

async function listRemoteAssets(
  source: SyncSourceRef,
  auth: SyncAuthContext,
  ctx?: SyncProviderContext
): Promise<RemoteAssetList> {
  const folderId = source.gdrive?.folderId;
  if (!folderId) {
    throw new Error('Missing Google Drive folder id.');
  }
  const token = await auth.getToken();

  // Verify the target is actually a folder (open?id= URLs can point at
  // files) and that the user can read it, so errors surface clearly.
  const metaRes = await driveFetch(
    `/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType&supportsAllDrives=true`,
    token,
    ctx?.onStatus
  );
  const meta = await metaRes.json().catch(() => ({}));
  if (meta?.mimeType !== FOLDER_MIME_TYPE) {
    throw new SyncAccessError(
      'The URL points to a Drive file, not a folder. Paste a link to a Drive folder.'
    );
  }

  const files: DriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,md5Checksum)',
      pageSize: String(LIST_PAGE_SIZE),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const res = await driveFetch(
      `/drive/v3/files?${params.toString()}`,
      token,
      ctx?.onStatus
    );
    const data = await res.json();
    files.push(...(data?.files || []));
    pageToken = data?.nextPageToken || '';
  } while (pageToken);

  const assets: RemoteAsset[] = files
    .filter((file) => {
      const mimeType = String(file.mimeType || '');
      // Subfolders are not recursed into (v1) and native Google editors
      // files (Docs/Sheets/Slides/shortcuts) have no binary content.
      return file.id && !mimeType.startsWith(GOOGLE_APPS_MIME_PREFIX);
    })
    .map((file) => {
      const ref: DriveAssetRef = {mimeType: file.mimeType};
      return {
        remoteId: file.id,
        name: file.name || file.id,
        filename: sanitizeAssetName(file.name || file.id),
        // Drive reports md5 up front, so unchanged files skip the download
        // entirely (see `source.remoteHash` in the engine).
        ...(file.md5Checksum ? {contentHash: file.md5Checksum} : {}),
        ref: ref,
      };
    });
  // Drive has no cheap folder-level version, so `version` is left unset
  // (the engine's whole-sync fast path doesn't apply; the md5 skip above
  // keeps unchanged re-syncs download-free).
  return {assets};
}

async function download(
  asset: RemoteAsset,
  source: SyncSourceRef,
  auth: SyncAuthContext,
  ctx?: SyncProviderContext
): Promise<File> {
  const token = await auth.getToken();
  const res = await driveFetch(
    `/drive/v3/files/${encodeURIComponent(asset.remoteId)}?alt=media&supportsAllDrives=true`,
    token,
    ctx?.onStatus
  );
  const blob = await res.blob();
  const ref = asset.ref as DriveAssetRef | undefined;
  return new File([blob], asset.filename, {
    type: ref?.mimeType || blob.type || 'application/octet-stream',
  });
}

export const GDRIVE_PROVIDER: AssetSyncProvider = {
  id: 'gdrive',
  label: 'Google Drive',
  authType: 'oauth',
  loginLabel: 'Sign in with Google',
  interactiveLogin: driveInteractiveLogin,
  createAuthContext: createAuthContext,
  tokenHelp: {
    text: 'Sign in with a Google account that has access to the Drive folder. Only your account’s access is used — teammates sync with their own accounts.',
  },
  parseSourceUrl: (url: string) => {
    const gdrive = parseDriveFolderUrl(url);
    if (!gdrive) {
      return null;
    }
    return {provider: 'gdrive', url, gdrive};
  },
  listRemoteAssets: listRemoteAssets,
  download: download,
};
