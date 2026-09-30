/**
 * @fileoverview Isomorphic helpers for the asset library.
 *
 * Shared by the CMS UI (`ui/utils/assets.ts`) and the server-side
 * `RootCMSClient` (`core/assets.ts`) so that both write the same asset db
 * docs, embed the same field values in CMS docs and fan out asset updates the
 * same way.
 */

/**
 * Extensions supported by the Google Image Service.
 * @see {@link https://cloud.google.com/appengine/docs/standard/services/images?tab=go#image-formats}
 */
export const GCI_SUPPORTED_EXTS = [
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'tiff',
  'webp',
];

/** Extensions compatible with the image field. */
export const IMAGE_EXTS = [...GCI_SUPPORTED_EXTS, 'svg'];

/**
 * Image extensions that preview as images in the CMS but are excluded from
 * the image field's default accept list. To accept one of these, a field
 * must opt in via its `exts` config, e.g. `exts: ['image/avif']`.
 */
export const OPT_IN_IMAGE_EXTS = ['avif'];

/** All extensions that are previewed as images in the CMS UI. */
export const PREVIEW_IMAGE_EXTS = [...IMAGE_EXTS, ...OPT_IN_IMAGE_EXTS];

export const VIDEO_EXTS = ['mp4', 'webm'];

/** File data stored in image/file fields and on asset library files. */
export interface UploadedFile {
  src: string;
  filename?: string;
  gcsPath?: string;
  width?: number;
  height?: number;
  alt?: string;
  uploadedBy?: string;
  uploadedAt?: string | number;
  canvasBgColor?: 'light' | 'dark';
  /**
   * When true, alt text handling is disabled for the file (e.g. decorative
   * images). The alt text input is hidden in docs that use the file and no
   * alt text is propagated from the asset library.
   */
  altDisabled?: boolean;
  /** The original source URL if the image has been edited. */
  originalSrc?: string;
  /**
   * When the file was selected from the asset library, the id of the asset at
   * `Projects/<projectId>/Assets/<assetId>`. Updates to the asset fan out to
   * docs that embed it (see `ui/utils/assets.ts` and `core/assets.ts`).
   */
  assetId?: string;
}

/** The value stored in a doc's image/file field when linked to an asset. */
export type AssetFieldValue = UploadedFile & {assetId: string};

/** Result of fanning out an asset update to docs that use it. */
export interface AssetSyncResult {
  /** Doc ids that were updated. */
  updatedDocIds: string[];
  /** Doc ids that failed to update (eventual consistency; retry by re-syncing). */
  failedDocIds: string[];
}

/** The minimal shape of an asset library file used by the helpers below. */
export interface AssetFileLike {
  id: string;
  file: UploadedFile;
}

export class AssetNameError extends Error {}

const MAX_NAME_LENGTH = 200;

/** Folder and file names must not contain slashes or control chars. */
// eslint-disable-next-line no-control-regex
const INVALID_NAME_RE = /[/\\\u0000-\u001f]/;

export function getFileExt(filename: string) {
  return normalizeExt(filename.split('.').at(-1) || '');
}

/**
 * Normalizes file extensions like `.PNG` to `.png` and `.JPEG` to `.jpg`.
 */
export function normalizeExt(ext: string) {
  let output = String(ext).toLowerCase();
  if (output === 'jpeg') {
    output = 'jpg';
  }
  return output;
}

/**
 * Validates a file or folder display name. Returns the trimmed name or throws
 * an `AssetNameError`.
 */
export function validateAssetName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new AssetNameError('Name is required.');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new AssetNameError(
      `Name is too long (max ${MAX_NAME_LENGTH} chars).`
    );
  }
  if (INVALID_NAME_RE.test(trimmed)) {
    throw new AssetNameError('Name cannot contain slashes.');
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new AssetNameError('Invalid name.');
  }
  return trimmed;
}

/**
 * Joins a parent folder path and a name into a folder path. An empty `name`
 * resolves to the parent path itself, e.g. the destination of a file uploaded
 * directly into a folder rather than into a subfolder of it.
 */
export function joinFolderPath(parent: string, name: string): string {
  if (!name) {
    return parent || '';
  }
  return parent ? `${parent}/${name}` : name;
}

/**
 * Normalizes a stored `parent` path. Files uploaded into a folder by an
 * earlier version of the folder upload flow were stored with a trailing slash
 * (e.g. `marketing/` instead of `marketing`), which hid them from the folder
 * listing.
 */
export function normalizeParentPath(parent: string): string {
  return (parent || '').replace(/\/+$/, '');
}

/** Splits a folder path into its segments, e.g. `'a/b'` -> `['a', 'b']`. */
export function parseFolderPath(folderPath: string): string[] {
  if (!folderPath) {
    return [];
  }
  return folderPath.split('/').filter(Boolean);
}

/**
 * Validates every segment of a relative folder path (e.g. the folder path of a
 * file within a folder upload), returning the normalized path. Throws an
 * `AssetNameError` if any segment is invalid.
 */
export function validateFolderPath(folderPath: string): string {
  return parseFolderPath(folderPath).map(validateAssetName).join('/');
}

/**
 * Returns the deterministic db doc id for a folder path. Using a
 * deterministic id prevents two users from creating duplicate folders with
 * the same path.
 */
export function getFolderId(folderPath: string): string {
  return `folder-${encodeURIComponent(folderPath)}`;
}

/** Returns true if `path` is the same as or nested below `parentPath`. */
export function isDescendantPath(path: string, parentPath: string) {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

/**
 * Swaps a filename's extension, e.g. `replaceFileExt('hero.png', 'webp')`
 * returns `'hero.webp'`. Names without an extension are returned unchanged.
 */
export function replaceFileExt(name: string, newExt: string): string {
  const dotIndex = (name || '').lastIndexOf('.');
  if (!newExt || dotIndex <= 0) {
    return name;
  }
  if (getFileExt(name) === newExt) {
    return name;
  }
  return `${name.slice(0, dotIndex)}.${newExt}`;
}

/**
 * Builds the file data for an asset whose file is being replaced (e.g.
 * uploading a new version). Preserves the existing alt text when the new
 * upload doesn't define one, and keeps alt text handling disabled if it was
 * disabled on the asset.
 */
export function buildReplacedAssetFile(
  previousFile: UploadedFile | undefined,
  newFile: UploadedFile
): UploadedFile {
  const file = removeUndefinedValues(newFile);
  if (!file.alt && previousFile?.alt) {
    file.alt = previousFile.alt;
  }
  if (previousFile?.altDisabled) {
    file.altDisabled = true;
  }
  return file;
}

/**
 * Builds the field value to embed in a doc when an asset is selected from the
 * asset library. The full file data is copied into the doc (so fetching the
 * doc requires no extra RPCs) along with an `assetId` backlink used to keep
 * the copy in sync.
 */
export function buildAssetFieldValue(asset: AssetFileLike): AssetFieldValue {
  const value: AssetFieldValue = {
    ...removeUndefinedValues(asset.file),
    assetId: asset.id,
  };
  // When alt text handling is disabled, the alt text stored on the asset is
  // kept on the asset itself but not propagated to docs.
  if (value.altDisabled) {
    value.alt = '';
  }
  return value;
}

/**
 * Builds the new embedded field value for a doc when syncing an asset update,
 * preserving doc-level customizations (alt text, canvas bg color) that differ
 * from the asset's previous values.
 */
export function buildSyncedFieldValue(
  asset: AssetFileLike,
  existingValue: any,
  previousFile?: UploadedFile
): AssetFieldValue {
  const next = buildAssetFieldValue(asset);
  // Doc-level alt customizations are dropped when the asset disables alt
  // text handling.
  if (!asset.file?.altDisabled) {
    const prevAlt = previousFile?.alt ?? asset.file?.alt ?? '';
    const docAlt = existingValue?.alt || '';
    if (docAlt && docAlt !== prevAlt) {
      next.alt = docAlt;
    }
  }
  const prevBgColor = previousFile?.canvasBgColor ?? asset.file?.canvasBgColor;
  if (
    existingValue?.canvasBgColor &&
    existingValue.canvasBgColor !== prevBgColor
  ) {
    next.canvasBgColor = existingValue.canvasBgColor;
  }
  return next;
}

/** Checks if a value looks like an asset-linked image/file field value. */
export function isAssetFieldValue(data: any): data is AssetFieldValue {
  return typeof data?.assetId === 'string' && typeof data?.src === 'string';
}

/** Returns true for non-plain objects that should not be walked (e.g. Timestamps). */
function isOpaqueObject(data: any): boolean {
  return typeof data.toMillis === 'function';
}

/**
 * Recursively extracts the asset ids embedded within a doc's fields data.
 * Works with both marshaled (db) and unmarshaled data. The result is sorted
 * so it can be compared/stored deterministically.
 */
export function extractAssetIds(data: any): string[] {
  const ids = new Set<string>();
  collectAssetIds(data, ids);
  return Array.from(ids).sort();
}

function collectAssetIds(data: any, ids: Set<string>) {
  if (!data || typeof data !== 'object') {
    return;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      collectAssetIds(item, ids);
    }
    return;
  }
  if (isOpaqueObject(data)) {
    return;
  }
  if (isAssetFieldValue(data)) {
    ids.add(data.assetId);
    return;
  }
  for (const key of Object.keys(data)) {
    collectAssetIds(data[key], ids);
  }
}

/**
 * Returns true if `data` contains any asset-linked field value at any nesting
 * depth. Short-circuits on the first match.
 */
export function containsAssetId(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (containsAssetId(item)) {
        return true;
      }
    }
    return false;
  }
  if (isOpaqueObject(data)) {
    return false;
  }
  if (isAssetFieldValue(data)) {
    return true;
  }
  for (const key of Object.keys(data)) {
    if (containsAssetId(data[key])) {
      return true;
    }
  }
  return false;
}

/**
 * Walks a doc's marshaled fields data collecting the dot-notation db paths of
 * all embedded copies of an asset. Marshaled data stores arrays as keyed
 * objects (see `marshalArray()`), so every node is addressable with a
 * dot-notation path that can be used directly with a db `update()`.
 */
export function collectAssetFieldPaths(
  data: any,
  assetId: string,
  basePath: string,
  found: Array<{path: string; value: any}>
) {
  if (!data || typeof data !== 'object') {
    return;
  }
  // True arrays should not appear in marshaled draft data, and array items
  // cannot be addressed with a dot-notation path, so skip them.
  if (Array.isArray(data)) {
    return;
  }
  if (isOpaqueObject(data)) {
    return;
  }
  if (isAssetFieldValue(data)) {
    if (data.assetId === assetId) {
      found.push({path: basePath, value: data});
    }
    return;
  }
  for (const key of Object.keys(data)) {
    collectAssetFieldPaths(data[key], assetId, `${basePath}.${key}`, found);
  }
}

/** Returns a copy of an object with `undefined` values removed. */
export function removeUndefinedValues<T extends Record<string, any>>(
  obj: T
): T {
  const result: Record<string, any> = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result as T;
}
