/**
 * Shared, Firebase-free types and helpers for the GCS-backed asset library.
 *
 * An "asset" is a library entry stored at `Projects/{projectId}/Assets/{assetId}`
 * that holds the canonical file metadata. When an image/file field picks a
 * library asset, the asset's data is denormalized inline onto the doc (so doc
 * GETs stay O(1) Firestore RPCs) together with an `assetId` marker. Replacing an
 * asset's file fans the new data out to every referencing draft doc.
 *
 * These helpers are pure (no Firebase imports) so they can run on both the
 * client (editor UI) and the server (`core/`).
 */

/** The key used to mark an inline field value as backed by a library asset. */
export const ASSET_ID_KEY = 'assetId';

/**
 * Canonical file metadata stored on an asset and denormalized onto referencing
 * docs. Structurally compatible with `UploadedFile` (ui/utils/gcs.ts), but
 * declared here so server code can use it without importing `firebase/storage`.
 */
export interface AssetFile {
  src: string;
  filename?: string;
  gcsPath?: string;
  width?: number;
  height?: number;
  alt?: string;
  canvasBgColor?: 'light' | 'dark';
  uploadedBy?: string;
  uploadedAt?: string | number;
}

/** A library asset as stored at `Projects/{projectId}/Assets/{assetId}`. */
export interface Asset extends AssetFile {
  /** The asset id (matches the Firestore doc id). Stable across replacements. */
  id: string;
  /** Increments each time the asset's file or alt changes (drives fan-out). */
  version: number;
  /** Folder path that contains the asset in the library UI, e.g. `/logos`. */
  dir?: string;
  sys?: {
    createdAt?: number;
    createdBy?: string;
    modifiedAt?: number;
    modifiedBy?: string;
    replacedAt?: number;
    replacedBy?: string;
  };
}

/**
 * A folder in the asset library's filesystem-like UI. Folders are a CMS-side
 * organizational layer (stored at `Projects/{projectId}/AssetFolders/{id}`);
 * they are NOT GCS prefixes and never denormalize onto docs.
 */
export interface AssetFolder {
  id: string;
  /** Absolute folder path, e.g. `/logos` or `/logos/2024`. */
  path: string;
  /** Display name (last path segment), e.g. `2024`. */
  name: string;
  /** Parent folder path, e.g. `/logos` (root is `/`). */
  parent: string;
}

/** An inline field value that is backed by a library asset. */
export type AssetRef = AssetFile & {
  assetId: string;
  assetVersion?: number;
};

/**
 * Normalizes a folder path: ensures a single leading slash, no trailing slash,
 * and treats empty/undefined as the root `/`.
 */
export function normalizeAssetDir(dir?: string): string {
  if (!dir) {
    return '/';
  }
  let d = dir.trim();
  if (!d.startsWith('/')) {
    d = `/${d}`;
  }
  if (d.length > 1 && d.endsWith('/')) {
    d = d.slice(0, -1);
  }
  return d || '/';
}

/** Returns true if `value` is an inline field value backed by a library asset. */
export function isAssetRef(value: any): value is AssetRef {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value[ASSET_ID_KEY] === 'string' &&
    !!value[ASSET_ID_KEY]
  );
}

/**
 * Builds the inline field value to store on a doc when a field picks a library
 * asset. Alt text is asset-authoritative, so the inline value is simply a
 * denormalized snapshot of the asset's canonical fields plus the
 * `assetId`/`assetVersion` markers. Undefined fields are omitted because
 * Firestore rejects `undefined` values.
 */
export function assetToFieldValue(asset: Asset): AssetRef {
  const value: AssetRef = {
    src: asset.src,
    assetId: asset.id,
    assetVersion: asset.version,
  };
  if (asset.filename !== undefined) value.filename = asset.filename;
  if (asset.gcsPath !== undefined) value.gcsPath = asset.gcsPath;
  if (asset.width !== undefined) value.width = asset.width;
  if (asset.height !== undefined) value.height = asset.height;
  if (asset.canvasBgColor !== undefined) value.canvasBgColor = asset.canvasBgColor;
  // Alt is asset-authoritative: always reflect the asset's alt (default '').
  value.alt = asset.alt ?? '';
  return value;
}

/**
 * Returns true if two inline asset values are equivalent for the canonical
 * fields owned by the asset. Used by fan-out to skip docs that are already
 * current and avoid spurious writes / `modifiedAt` churn.
 */
export function assetFieldValueIsCurrent(value: any, asset: Asset): boolean {
  if (!isAssetRef(value) || value.assetId !== asset.id) {
    return false;
  }
  const next = assetToFieldValue(asset);
  return (
    value.src === next.src &&
    value.gcsPath === next.gcsPath &&
    value.width === next.width &&
    value.height === next.height &&
    value.canvasBgColor === next.canvasBgColor &&
    (value.alt ?? '') === next.alt &&
    value.assetVersion === next.assetVersion
  );
}

/** Encodes a docId (e.g. `Pages/foo`) into a safe Firestore document key. */
export function buildUsageKey(docId: string): string {
  // Firestore doc ids cannot contain '/'. Encode slashes as `--`, matching the
  // slug-encoding convention used elsewhere in the CMS. The original collection
  // and slug are stored as fields on the usage doc, so the key only needs to be
  // a stable, unique identifier for the docId.
  return docId.split('/').join('--');
}
