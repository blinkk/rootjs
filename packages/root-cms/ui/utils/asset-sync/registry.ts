/**
 * @fileoverview Registry of available asset sync providers.
 *
 * To add a new provider (e.g. Google Drive), implement the
 * `AssetSyncProvider` interface and add it to `SYNC_PROVIDERS`. The engine,
 * data model, and UI are provider-agnostic.
 */

import {FIGMA_PROVIDER} from './figma.js';
import {AssetSyncProvider, SyncSourceRef} from './types.js';

export const SYNC_PROVIDERS: AssetSyncProvider[] = [FIGMA_PROVIDER];

/** Returns the sync provider with the given id, if registered. */
export function getSyncProvider(id: string): AssetSyncProvider | null {
  return SYNC_PROVIDERS.find((provider) => provider.id === id) || null;
}

/**
 * Parses a pasted URL against every registered provider, returning the
 * first match.
 */
export function parseSyncSourceUrl(
  url: string
): {provider: AssetSyncProvider; source: SyncSourceRef} | null {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return null;
  }
  for (const provider of SYNC_PROVIDERS) {
    const source = provider.parseSourceUrl(trimmed);
    if (source) {
      return {provider, source};
    }
  }
  return null;
}
