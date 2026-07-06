/**
 * @fileoverview Per-user credential storage for asset sync providers.
 *
 * Tokens are held in the browser's localStorage, keyed per project and
 * provider, mirroring how Google OAuth consent is cached by
 * `useGapiClient`. The token never touches Firestore or the CMS server --
 * the only party that ever sees it is the provider's API. This means each
 * user authenticates with their own credential, so a user can only sync
 * sources they personally have access to. The cost is that tokens are
 * per-browser; the connect UI prompts again on a new device.
 */

import {SyncAuthContext, SyncTokenRequiredError} from './types.js';

function getTokenStorageKey(provider: string): string {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  return `root-cms::${projectId}::asset-sync::${provider}::token`;
}

/** Returns the user's stored token for a provider, if any. */
export function getProviderToken(provider: string): string | null {
  try {
    return localStorage.getItem(getTokenStorageKey(provider)) || null;
  } catch {
    return null;
  }
}

/** Stores the user's token for a provider. */
export function setProviderToken(provider: string, token: string) {
  try {
    localStorage.setItem(getTokenStorageKey(provider), token);
  } catch {
    // localStorage may be unavailable; the token is simply not persisted.
  }
}

/** Removes the user's stored token for a provider. */
export function clearProviderToken(provider: string) {
  try {
    localStorage.removeItem(getTokenStorageKey(provider));
  } catch {
    // Ignore.
  }
}

/**
 * Creates an auth context backed by the browser token store. `getToken()`
 * throws `SyncTokenRequiredError` when no token is stored, which the UI
 * catches to prompt the user for one.
 */
export function createBrowserAuthContext(provider: string): SyncAuthContext {
  return {
    async getToken() {
      const token = getProviderToken(provider);
      if (!token) {
        throw new SyncTokenRequiredError(provider);
      }
      return token;
    },
    invalidateToken() {
      clearProviderToken(provider);
    },
  };
}
