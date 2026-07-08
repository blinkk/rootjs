/**
 * @fileoverview The asset sync engine.
 *
 * Syncs the exportable assets of an external source (e.g. a Figma file)
 * into an asset-library folder. The engine is provider-agnostic; all
 * source-specific logic lives behind the `AssetSyncProvider` interface.
 *
 * The diff is keyed on each asset's `source.remoteId` so re-syncs update
 * assets in place: changed files go through `replaceAssetFile()` +
 * `syncAssetToDocs()` (fanning the new file out to docs that embed the
 * asset), new files are created, and files removed at the source are
 * flagged (never auto-deleted, since published docs may embed them).
 *
 * INVARIANT: a file whose exported bytes are unchanged since the last sync
 * produces no side effects -- no GCS upload, no asset doc write, and no
 * `syncAssetToDocs` fan-out. This is enforced by three tiers of checks
 * (cheapest first):
 *
 *   1. Source-version fast path: when the provider's source version equals
 *      the folder's `sync.lastRemoteVersion`, the whole sync finishes
 *      immediately ("everything up to date") with no downloads.
 *   2. Provider hash skip: when the provider reports a content hash before
 *      download (e.g. Drive's md5), a match against `source.remoteHash`
 *      skips the download.
 *   3. Byte hash skip: after download, a SHA-1 match against
 *      `source.contentHash` ends the item before any upload or db write.
 */

import {Timestamp} from 'firebase/firestore';
import {logAction} from '../actions.js';
import {
  Asset,
  AssetFile,
  AssetFolder,
  AssetFolderSyncResult,
  AssetSource,
  createAssetFile,
  finalizeFolderSync,
  getAsset,
  joinFolderPath,
  listAssets,
  replaceAssetFile,
  setFolderSyncState,
  syncAssetToDocs,
  updateAssetSourceMissing,
} from '../assets.js';
import {UploadedFile, sha1, uploadFileToGCS} from '../gcs.js';
import {buildUniqueAssetName, sanitizeAssetName} from './names.js';
import {getSyncProvider} from './registry.js';
import {createBrowserAuthContext} from './tokens.js';
import {
  AssetSyncProvider,
  RemoteAsset,
  SyncAuthContext,
  SyncInProgressError,
  SyncProgress,
  SyncProviderContext,
  SyncRateLimitError,
  SyncSummary,
} from './types.js';

/** A `sync.state` lease older than this is treated as abandoned. */
export const STALE_LEASE_MS = 10 * 60 * 1000;

/** Default number of concurrent downloads/imports. */
const DEFAULT_CONCURRENCY = 4;

/**
 * Side-effecting dependencies of the sync engine. Injectable so tests can
 * run the diff algorithm with fakes (and assert, e.g., that an unchanged
 * re-sync performs zero writes).
 */
export interface SyncEngineDeps {
  getFolder(folderId: string): Promise<AssetFolder | null>;
  listAssets(folderPath: string): Promise<Asset[]>;
  uploadFile(file: File): Promise<UploadedFile>;
  createAssetFile(options: {
    parent: string;
    file: UploadedFile;
    name?: string;
    source?: AssetSource;
  }): Promise<AssetFile>;
  replaceAssetFile(
    asset: AssetFile,
    file: UploadedFile,
    options?: {source?: AssetSource}
  ): Promise<AssetFile>;
  syncAssetToDocs(
    asset: AssetFile,
    options?: {previousFile?: UploadedFile}
  ): Promise<{updatedDocIds: string[]; failedDocIds: string[]}>;
  setFolderSyncState(folderId: string): Promise<void>;
  finalizeFolderSync(
    folderId: string,
    result: AssetFolderSyncResult,
    options?: {remoteVersion?: string}
  ): Promise<void>;
  updateAssetSourceMissing(assetId: string, missing: boolean): Promise<void>;
  sha1(file: File): Promise<string>;
  now(): Timestamp;
  logAction(action: string, options?: {metadata?: any}): void;
}

function defaultDeps(): SyncEngineDeps {
  return {
    getFolder: async (folderId: string) => {
      const asset = await getAsset(folderId);
      return asset && asset.type === 'folder' ? asset : null;
    },
    listAssets: listAssets,
    uploadFile: (file: File) => uploadFileToGCS(file),
    createAssetFile: createAssetFile,
    replaceAssetFile: replaceAssetFile,
    syncAssetToDocs: syncAssetToDocs,
    setFolderSyncState: setFolderSyncState,
    finalizeFolderSync: finalizeFolderSync,
    updateAssetSourceMissing: updateAssetSourceMissing,
    sha1: sha1,
    now: () => Timestamp.now(),
    logAction: logAction,
  };
}

export interface SyncFolderOptions {
  folder: AssetFolder;
  /** Defaults to the browser token store for the folder's provider. */
  auth?: SyncAuthContext;
  /** Defaults to the registered provider for `folder.sync.provider`. */
  provider?: AssetSyncProvider;
  onProgress?: (progress: SyncProgress) => void;
  /** Proceed even when another user's sync lease is active. */
  force?: boolean;
  concurrency?: number;
  /** Test seam; production callers should not provide this. */
  deps?: Partial<SyncEngineDeps>;
}

/**
 * Syncs a folder from its connected source. Resolves with a summary of the
 * changes; throws on setup/enumeration failures (invalid token, no access,
 * sync already in progress). Per-item failures don't abort the sync; they
 * are collected in `summary.failed`.
 */
export async function syncFolder(
  options: SyncFolderOptions
): Promise<SyncSummary> {
  const deps: SyncEngineDeps = {...defaultDeps(), ...options.deps};
  const folder = options.folder;
  const sync = folder.sync;
  if (!sync) {
    throw new Error('Folder is not connected to a sync source.');
  }
  const provider = options.provider ?? getSyncProvider(sync.provider);
  if (!provider) {
    throw new Error(`Unknown sync provider: ${sync.provider}`);
  }
  const auth = options.auth ?? createBrowserAuthContext(provider.id);
  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;

  // Progress reporting. Providers report transient status (e.g. rate-limit
  // backoff countdowns) through `providerCtx.onStatus`, which re-emits the
  // latest progress with a `note`; regular progress events clear the note.
  let lastProgress: SyncProgress = {phase: 'enumerating'};
  const onProgress = (progress: SyncProgress) => {
    lastProgress = progress;
    options.onProgress?.(progress);
  };
  const providerCtx: SyncProviderContext = {
    onStatus: (message: string) => {
      options.onProgress?.({...lastProgress, note: message});
    },
  };

  // Resolve the token before taking the lease or writing anything, so a
  // missing token surfaces as a prompt with zero side effects.
  await auth.getToken();

  // Re-fetch the folder for an up-to-date lease check. The lease is
  // best-effort: it warns users about concurrent syncs; races that slip
  // through are benign (both syncs converge on the same content).
  const freshFolder = (await deps.getFolder(folder.id)) || folder;
  const state = freshFolder.sync?.state;
  if (state?.status === 'syncing' && !options.force) {
    const startedAtMillis = state.startedAt?.toMillis
      ? state.startedAt.toMillis()
      : 0;
    if (Date.now() - startedAtMillis < STALE_LEASE_MS) {
      throw new SyncInProgressError(state.startedBy, state.startedAt);
    }
  }
  await deps.setFolderSyncState(folder.id);

  const summary: SyncSummary = {
    upToDate: false,
    added: 0,
    updated: 0,
    unchanged: 0,
    missing: 0,
    failed: [],
    updatedDocIds: [],
  };
  let enumerationError: Error | null = null;
  let remoteVersion: string | undefined;

  try {
    onProgress({phase: 'enumerating'});
    const remoteList = await provider.listRemoteAssets(sync, auth, providerCtx);
    remoteVersion = remoteList.version;

    const folderPath = joinFolderPath(folder.parent, folder.name);
    const localAssets = await deps.listAssets(folderPath);
    // Index this folder's previously-synced files by remote id. Manually
    // uploaded files coexisting in the folder are left alone.
    const syncedByRemoteId = new Map<string, AssetFile>();
    for (const asset of localAssets) {
      if (
        asset.type === 'file' &&
        asset.source?.provider === provider.id &&
        asset.source.remoteId
      ) {
        syncedByRemoteId.set(asset.source.remoteId, asset);
      }
    }

    const remoteIds = new Set(remoteList.assets.map((a) => a.remoteId));
    const missingAssets = Array.from(syncedByRemoteId.values()).filter(
      (asset) => !remoteIds.has(asset.source!.remoteId)
    );
    const reappearedAssets = remoteList.assets.filter(
      (a) => syncedByRemoteId.get(a.remoteId)?.source?.missingSince
    );

    // Fast path: the source is unchanged since the last fully-successful
    // sync and the folder still contains every synced asset -> nothing to
    // download and nothing to write (aside from the folder's sync metadata).
    if (
      remoteVersion &&
      freshFolder.sync?.lastRemoteVersion === remoteVersion &&
      missingAssets.length === 0 &&
      reappearedAssets.length === 0 &&
      remoteList.assets.every((a) => syncedByRemoteId.has(a.remoteId))
    ) {
      summary.upToDate = true;
      summary.unchanged = remoteList.assets.length;
      return summary;
    }

    // Split into new imports and existing assets to check. Provider-reported
    // hashes (e.g. Drive's md5) skip unchanged items before downloading.
    const candidates: RemoteAsset[] = [];
    for (const remoteAsset of remoteList.assets) {
      const existing = syncedByRemoteId.get(remoteAsset.remoteId);
      if (
        existing &&
        remoteAsset.contentHash &&
        existing.source?.remoteHash === remoteAsset.contentHash
      ) {
        summary.unchanged += 1;
        if (existing.source?.missingSince) {
          await deps.updateAssetSourceMissing(existing.id, false);
        }
        continue;
      }
      candidates.push(remoteAsset);
    }

    // Let the provider batch per-item download prep (e.g. Figma render URL
    // resolution) for just the items that actually need downloading.
    if (provider.prepareDownloads && candidates.length > 0) {
      await provider.prepareDownloads(candidates, sync, auth, providerCtx);
    }

    // Pre-assign de-duped names for new imports (deterministic by remote id
    // order so concurrent syncs converge).
    const usedNames = new Set(
      localAssets.map((asset) => (asset.name || '').toLowerCase())
    );
    const assignedNames = new Map<string, string>();
    const newImports = candidates
      .filter((a) => !syncedByRemoteId.has(a.remoteId))
      .sort((a, b) => a.remoteId.localeCompare(b.remoteId));
    for (const remoteAsset of newImports) {
      const name = buildUniqueAssetName(
        sanitizeAssetName(remoteAsset.filename),
        usedNames
      );
      assignedNames.set(remoteAsset.remoteId, name);
    }

    let completed = 0;
    onProgress({phase: 'downloading', total: candidates.length, completed});

    // A rate-limited item means every remaining item would also be
    // rate-limited (after its own long retries), so the first one aborts
    // the queue. Nothing is lost: re-syncing later resumes cheaply since
    // already-imported items are skipped by content hash.
    let rateLimitError: SyncRateLimitError | null = null;

    await runPool(candidates, concurrency, async (remoteAsset) => {
      if (rateLimitError) {
        return;
      }
      onProgress({
        phase: 'downloading',
        total: candidates.length,
        completed,
        currentName: remoteAsset.name,
      });
      try {
        await syncItem(remoteAsset);
      } catch (err: any) {
        if (err instanceof SyncRateLimitError) {
          rateLimitError = err;
          return;
        }
        console.error(`failed to sync "${remoteAsset.name}":`, err);
        summary.failed.push({
          name: remoteAsset.name,
          error: String(err?.message || err),
        });
      }
      completed += 1;
      onProgress({phase: 'downloading', total: candidates.length, completed});
    });

    if (rateLimitError) {
      throw rateLimitError;
    }

    async function syncItem(remoteAsset: RemoteAsset) {
      const existing = syncedByRemoteId.get(remoteAsset.remoteId);
      const file = await provider!.download(
        remoteAsset,
        sync!,
        auth,
        providerCtx
      );
      const contentHash = await deps.sha1(file);
      // Unchanged bytes: strict no-op (no upload, no db write, no fan-out).
      if (existing && existing.source?.contentHash === contentHash) {
        summary.unchanged += 1;
        if (existing.source?.missingSince) {
          await deps.updateAssetSourceMissing(existing.id, false);
        }
        return;
      }
      const source: AssetSource = {
        provider: provider!.id,
        remoteId: remoteAsset.remoteId,
        remoteName: remoteAsset.name,
        contentHash: contentHash,
        syncedAt: deps.now(),
      };
      if (remoteAsset.contentHash) {
        source.remoteHash = remoteAsset.contentHash;
      }
      if (remoteVersion) {
        source.remoteVersion = remoteVersion;
      }
      const uploadedFile = await deps.uploadFile(file);
      if (existing) {
        const previousFile = existing.file;
        const updated = await deps.replaceAssetFile(existing, uploadedFile, {
          source,
        });
        const res = await deps.syncAssetToDocs(updated, {previousFile});
        summary.updated += 1;
        summary.updatedDocIds.push(...res.updatedDocIds);
        if (res.failedDocIds.length > 0) {
          summary.failed.push({
            name: remoteAsset.name,
            error: `Failed to update doc(s): ${res.failedDocIds.join(', ')}`,
          });
        }
      } else {
        await deps.createAssetFile({
          parent: folderPath,
          file: uploadedFile,
          name: assignedNames.get(remoteAsset.remoteId),
          source: source,
        });
        summary.added += 1;
      }
    }

    // Flag synced assets whose remote item is gone. Never auto-deleted --
    // docs may embed them; deletion stays a deliberate user action.
    for (const asset of missingAssets) {
      if (!asset.source?.missingSince) {
        try {
          await deps.updateAssetSourceMissing(asset.id, true);
        } catch (err) {
          console.error(`failed to flag missing asset ${asset.id}:`, err);
        }
      }
      summary.missing += 1;
    }
  } catch (err: any) {
    enumerationError = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    onProgress({phase: 'finalizing'});
    const ok = !enumerationError && summary.failed.length === 0;
    const result: AssetFolderSyncResult = {
      ok,
      added: summary.added,
      updated: summary.updated,
      unchanged: summary.unchanged,
      missing: summary.missing,
      failed: summary.failed.length,
    };
    if (enumerationError) {
      result.error = String(enumerationError.message || enumerationError);
    }
    try {
      // `lastRemoteVersion` is only advanced on a fully-successful sync so
      // the fast path never skips items that previously failed.
      await deps.finalizeFolderSync(folder.id, result, {
        remoteVersion: ok ? remoteVersion : undefined,
      });
    } catch (finalizeErr) {
      console.error('failed to finalize folder sync:', finalizeErr);
    }
    if (!enumerationError) {
      deps.logAction('asset.sync_run', {
        metadata: {
          folder: joinFolderPath(folder.parent, folder.name),
          provider: provider.id,
          added: summary.added,
          updated: summary.updated,
          unchanged: summary.unchanged,
          missing: summary.missing,
          failed: summary.failed.length,
          upToDate: summary.upToDate,
        },
      });
    }
  }
  return summary;
}

/** Runs `fn` over `items` with at most `concurrency` in flight. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];
  const numWorkers = Math.max(1, Math.min(concurrency, queue.length));
  for (let i = 0; i < numWorkers; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift()!;
          await fn(item);
        }
      })()
    );
  }
  await Promise.all(workers);
}
