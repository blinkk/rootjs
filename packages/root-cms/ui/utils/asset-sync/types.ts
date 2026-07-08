/**
 * @fileoverview Shared types for the asset sync system.
 *
 * The asset library supports connecting a folder to an external "sync
 * source" (e.g. a Figma file/node) and importing the source's exportable
 * assets into the folder. All provider-specific logic sits behind the
 * {@link AssetSyncProvider} interface so new sources (e.g. Google Drive) can
 * be added without changing the engine, data model, or UI.
 *
 * Credentials are per-user and browser-held (see `tokens.ts`) -- syncing
 * runs entirely client-side with the requesting user's own token, so only
 * users with access to the remote source can sync.
 */

import type {Timestamp} from 'firebase/firestore';
import type {AssetFolderSync} from '../assets.js';

/** The provider-identifying subset of a folder's sync connection. */
export type SyncSourceRef = Pick<
  AssetFolderSync,
  'provider' | 'url' | 'figma' | 'gdrive'
>;

/** An exportable item discovered at the remote source. */
export interface RemoteAsset {
  /**
   * Stable id, unique within the source. Stored on the imported asset as
   * `source.remoteId` and used to update assets in place on re-sync.
   */
  remoteId: string;
  /** Remote display name (e.g. the Figma node name). */
  name: string;
  /**
   * Suggested filename including extension, e.g. `icon-arrow@2x.png`.
   * Providers should sanitize names (see `sanitizeAssetName()` in
   * `engine.ts`); the engine additionally de-dupes collisions.
   */
  filename: string;
  /**
   * Provider-native content hash when known before download (e.g. Drive's
   * `md5Checksum`). A match against the asset's `source.remoteHash` skips
   * the download entirely. Figma does not provide one.
   */
  contentHash?: string;
  /**
   * Opaque provider payload needed by `download()` (e.g. a render URL).
   * Providers may populate this lazily in `prepareDownloads()`.
   */
  ref?: unknown;
}

/** Result of enumerating a sync source. */
export interface RemoteAssetList {
  /**
   * The source's current version, when the provider has one (e.g. the Figma
   * file `version`). When it matches the folder's `sync.lastRemoteVersion`,
   * the engine skips downloads entirely.
   */
  version?: string;
  assets: RemoteAsset[];
}

/**
 * Thrown when an operation needs a provider token and none is stored (or the
 * stored token was invalidated). The UI catches this to prompt for a token.
 */
export class SyncTokenRequiredError extends Error {
  constructor(
    readonly provider: string,
    message?: string
  ) {
    super(message || 'A token is required.');
    this.name = 'SyncTokenRequiredError';
  }
}

/**
 * Thrown when the user's token is valid but lacks access to the source
 * (e.g. the user cannot view the Figma file).
 */
export class SyncAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncAccessError';
  }
}

/** Thrown when another user's sync appears to be in progress. */
export class SyncInProgressError extends Error {
  constructor(
    readonly startedBy: string,
    readonly startedAt?: Timestamp
  ) {
    super(`A sync started by ${startedBy} is already in progress.`);
    this.name = 'SyncInProgressError';
  }
}

/** Provides the per-user credential for a sync provider. */
export interface SyncAuthContext {
  /**
   * Returns the user's token for the provider. Throws
   * {@link SyncTokenRequiredError} when no token is available.
   */
  getToken(): Promise<string>;
  /** Marks the stored token invalid (e.g. after a 401/403 from the API). */
  invalidateToken(): void;
}

/** A sync source implementation (e.g. Figma). */
export interface AssetSyncProvider {
  /** Provider id stored in db docs, e.g. `figma`. */
  id: string;
  /** Display name, e.g. `Figma`. */
  label: string;
  /** Help copy for the token prompt in the UI. */
  tokenHelp?: {
    /** Short instructions, e.g. where to create a token. */
    text: string;
    /** Link to the provider's token settings page. */
    url?: string;
  };
  /**
   * Parses a pasted URL into a source ref, or returns null if the URL isn't
   * recognized by this provider.
   */
  parseSourceUrl(url: string): SyncSourceRef | null;
  /**
   * Validates a token, preferably against `source` when provided (which
   * also verifies the user can access the source). Returns a display string
   * for the connected account when available, and a user-facing `error`
   * when the failure is more specific than "invalid token" (e.g. the token
   * is fine but lacks access to the source).
   */
  validateToken?(
    token: string,
    source?: SyncSourceRef
  ): Promise<{valid: boolean; account?: string; error?: string}>;
  /**
   * Enumerates the exportable assets at the source. Also serves as the
   * access check: implementations should throw {@link SyncAccessError} when
   * the user's token cannot read the source.
   */
  listRemoteAssets(
    source: SyncSourceRef,
    auth: SyncAuthContext
  ): Promise<RemoteAssetList>;
  /**
   * Optional hook called with the subset of assets that actually need
   * downloading (new/changed candidates), before `download()` is called.
   * Lets providers batch expensive per-item work (e.g. Figma render URL
   * resolution) and skip it entirely when everything is up to date.
   * Implementations typically populate each asset's `ref`.
   */
  prepareDownloads?(
    assets: RemoteAsset[],
    source: SyncSourceRef,
    auth: SyncAuthContext
  ): Promise<void>;
  /** Downloads one asset's bytes as a File (named `asset.filename`). */
  download(
    asset: RemoteAsset,
    source: SyncSourceRef,
    auth: SyncAuthContext
  ): Promise<File>;
}

/** Progress callback payload while a sync runs. */
export interface SyncProgress {
  phase: 'enumerating' | 'downloading' | 'finalizing';
  /** Total items being downloaded/imported (downloading phase). */
  total?: number;
  /** Items finished so far (downloading phase). */
  completed?: number;
  /** Name of an item currently being processed. */
  currentName?: string;
}

/** Per-item failure collected during a sync. */
export interface SyncItemError {
  name: string;
  error: string;
}

/** Result of a completed folder sync. */
export interface SyncSummary {
  /** True when the fast path found the source unchanged since last sync. */
  upToDate: boolean;
  added: number;
  updated: number;
  unchanged: number;
  /** Synced assets whose remote item no longer exists at the source. */
  missing: number;
  failed: SyncItemError[];
  /** Draft doc ids updated via asset fan-out (changed assets only). */
  updatedDocIds: string[];
}
