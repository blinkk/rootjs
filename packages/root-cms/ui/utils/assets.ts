/**
 * @fileoverview Data layer for the asset manager.
 *
 * Assets are stored in a flat DB collection at
 * `Projects/<projectId>/Assets/<assetId>`. Both files and folders live in the
 * same collection and are organized Drive-style using a `parent` folder path,
 * e.g. `''` (root) or `'marketing/q1'`. Listing a folder is a single
 * auto-indexed query on the `parent` field.
 *
 * When a user selects an asset for a `schema.image()` or `schema.file()`
 * field, a full copy of the file data is embedded into the CMS doc (along
 * with an `assetId` backlink) so that fetching the doc never requires an
 * extra RPC to resolve the asset. Each doc maintains a reverse index of the
 * asset ids it embeds at `sys.assets`, which is used to find docs that use an
 * asset and to fan out updates when an asset changes.
 */

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import {logAction} from './actions.js';
import {removeDocsFromCache} from './doc-cache.js';
import type {CMSDoc} from './doc.js';
import {UploadedFile} from './gcs.js';
import {autokey} from './rand.js';

export type AssetType = 'file' | 'folder';

export interface AssetBase {
  /** Unique id of the asset within the project. */
  id: string;
  type: AssetType;
  /** Parent folder path, e.g. `''` (root) or `'marketing/q1'`. */
  parent: string;
  /** Display name, e.g. `hero.png` for files or `q1` for folders. */
  name: string;
  createdAt: Timestamp;
  createdBy: string;
  modifiedAt: Timestamp;
  modifiedBy: string;
}

/** A file entry in the asset manager. */
export interface AssetFile extends AssetBase {
  type: 'file';
  /** The uploaded file data (same shape stored in image/file fields). */
  file: UploadedFile;
}

/** A folder entry in the asset manager. */
export interface AssetFolder extends AssetBase {
  type: 'folder';
}

export type Asset = AssetFile | AssetFolder;

/** The value stored in a doc's image/file field when linked to an asset. */
export type AssetFieldValue = UploadedFile & {assetId: string};

/** Result of fanning out an asset update to docs that use it. */
export interface AssetSyncResult {
  /** Doc ids that were updated. */
  updatedDocIds: string[];
  /** Doc ids that failed to update (eventual consistency; retry by re-syncing). */
  failedDocIds: string[];
}

export class AssetNameError extends Error {}

const MAX_NAME_LENGTH = 200;

/** Folder and file names must not contain slashes or control chars. */
// eslint-disable-next-line no-control-regex
const INVALID_NAME_RE = /[/\\\u0000-\u001f]/;

export function getAssetsDbCollection() {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  return collection(db, 'Projects', projectId, 'Assets');
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

/** Joins a parent folder path and a name into a folder path. */
export function joinFolderPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** Splits a folder path into its segments, e.g. `'a/b'` -> `['a', 'b']`. */
export function parseFolderPath(folderPath: string): string[] {
  if (!folderPath) {
    return [];
  }
  return folderPath.split('/').filter(Boolean);
}

/**
 * Returns the deterministic db doc id for a folder path. Using a
 * deterministic id prevents two users from creating duplicate folders with
 * the same path.
 */
export function getFolderId(folderPath: string): string {
  return `folder-${encodeURIComponent(folderPath)}`;
}

function sortAssets(assets: Asset[]): Asset[] {
  return assets.sort((a, b) => {
    // Folders are listed before files.
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

/**
 * Lists the assets (folders first, then files) within a folder.
 */
export async function listAssets(folderPath: string): Promise<Asset[]> {
  const colRef = getAssetsDbCollection();
  const q = query(colRef, where('parent', '==', folderPath || ''));
  const snapshot = await getDocs(q);
  const assets: Asset[] = [];
  snapshot.forEach((snap) => {
    assets.push(snap.data() as Asset);
  });
  return sortAssets(assets);
}

/** Fetches a single asset by id. */
export async function getAsset(assetId: string): Promise<Asset | null> {
  const docRef = doc(getAssetsDbCollection(), assetId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as Asset;
}

/**
 * Creates a folder within the asset manager. No-op if the folder already
 * exists.
 */
export async function createAssetFolder(
  parent: string,
  name: string
): Promise<AssetFolder> {
  const folderName = validateAssetName(name);
  const folderPath = joinFolderPath(parent, folderName);
  const folderId = getFolderId(folderPath);
  const docRef = doc(getAssetsDbCollection(), folderId);
  const folder = {
    id: folderId,
    type: 'folder',
    parent: parent || '',
    name: folderName,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  };
  // merge:true keeps createdAt/createdBy when the folder already exists.
  await setDoc(docRef, folder, {merge: true});
  logAction('asset.folder_create', {metadata: {folder: folderPath}});
  return (await getAsset(folderId)) as AssetFolder;
}

/**
 * Adds an uploaded file to the asset manager.
 */
export async function createAssetFile(options: {
  parent: string;
  file: UploadedFile;
  name?: string;
}): Promise<AssetFile> {
  const file = removeUndefinedValues(options.file);
  const name = validateAssetName(
    options.name || file.filename || basename(file.src)
  );
  const assetId = autokey(12);
  const docRef = doc(getAssetsDbCollection(), assetId);
  await setDoc(docRef, {
    id: assetId,
    type: 'file',
    parent: options.parent || '',
    name: name,
    file: file,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  logAction('asset.upload', {metadata: {assetId, name}});
  return (await getAsset(assetId)) as AssetFile;
}

/**
 * Renames an asset's display name. For files, renaming only affects the asset
 * manager (docs embed the original `filename`, which is unchanged). For
 * folders, the `parent` path of all descendants is updated to match.
 */
export async function renameAsset(asset: Asset, newName: string) {
  const name = validateAssetName(newName);
  if (name === asset.name) {
    return;
  }
  if (asset.type === 'folder') {
    const oldPath = joinFolderPath(asset.parent, asset.name);
    const newPath = joinFolderPath(asset.parent, name);
    await moveFolder(asset, newPath, name, asset.parent);
    logAction('asset.rename', {metadata: {from: oldPath, to: newPath}});
    return;
  }
  const docRef = doc(getAssetsDbCollection(), asset.id);
  await updateDoc(docRef, {
    name: name,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  logAction('asset.rename', {
    metadata: {assetId: asset.id, from: asset.name, to: name},
  });
}

/**
 * Moves an asset into a different folder.
 */
export async function moveAsset(asset: Asset, toFolder: string) {
  const newParent = toFolder || '';
  if (newParent === asset.parent) {
    return;
  }
  if (asset.type === 'folder') {
    const oldPath = joinFolderPath(asset.parent, asset.name);
    const newPath = joinFolderPath(newParent, asset.name);
    if (newPath === oldPath || isDescendantPath(newPath, oldPath)) {
      throw new Error('Cannot move a folder into itself.');
    }
    await moveFolder(asset, newPath, asset.name, newParent);
    logAction('asset.move', {metadata: {from: oldPath, to: newPath}});
    return;
  }
  const docRef = doc(getAssetsDbCollection(), asset.id);
  await updateDoc(docRef, {
    parent: newParent,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  logAction('asset.move', {
    metadata: {assetId: asset.id, from: asset.parent, to: newParent},
  });
}

/** Returns true if `path` is the same as or nested below `parentPath`. */
function isDescendantPath(path: string, parentPath: string) {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

/**
 * Moves/renames a folder. Folder ids are derived from their path, so this
 * creates a new folder doc, re-parents all descendants and removes the old
 * folder doc. Writes are batched (max 500 ops per batch).
 */
async function moveFolder(
  folder: AssetFolder,
  newPath: string,
  newName: string,
  newParent: string
) {
  const oldPath = joinFolderPath(folder.parent, folder.name);
  const colRef = getAssetsDbCollection();
  const db = window.firebase.db;

  // Fetch all descendants. `parent` range query matches `oldPath` prefixes,
  // e.g. querying `foo` also matches `foobar`, so filter exact matches below.
  const q = query(
    colRef,
    where('parent', '>=', oldPath),
    where('parent', '<=', `${oldPath}\uf8ff`)
  );
  const snapshot = await getDocs(q);
  const descendants: Asset[] = [];
  snapshot.forEach((snap) => {
    const data = snap.data() as Asset;
    if (isDescendantPath(data.parent, oldPath)) {
      descendants.push(data);
    }
  });

  let batch = writeBatch(db);
  let numOps = 0;
  const commitIfFull = async () => {
    numOps += 1;
    if (numOps >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      numOps = 0;
    }
  };

  // Create the new folder doc (preserving the original created metadata).
  const newFolderId = getFolderId(newPath);
  batch.set(doc(colRef, newFolderId), {
    id: newFolderId,
    type: 'folder',
    parent: newParent,
    name: newName,
    createdAt: folder.createdAt ?? serverTimestamp(),
    createdBy: folder.createdBy ?? window.firebase.user.email,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  await commitIfFull();

  for (const descendant of descendants) {
    const newDescendantParent =
      newPath + descendant.parent.slice(oldPath.length);
    if (descendant.type === 'folder') {
      // Folder ids are path-derived, so descendant folders are re-created
      // with a new id and the old doc is deleted.
      const descendantPath = joinFolderPath(
        newDescendantParent,
        descendant.name
      );
      batch.set(doc(colRef, getFolderId(descendantPath)), {
        ...descendant,
        id: getFolderId(descendantPath),
        parent: newDescendantParent,
        modifiedAt: serverTimestamp(),
        modifiedBy: window.firebase.user.email,
      });
      await commitIfFull();
      batch.delete(doc(colRef, descendant.id));
      await commitIfFull();
    } else {
      batch.update(doc(colRef, descendant.id), {
        parent: newDescendantParent,
        modifiedAt: serverTimestamp(),
        modifiedBy: window.firebase.user.email,
      });
      await commitIfFull();
    }
  }

  // Remove the old folder doc (unless it shares the same id, e.g. no-op).
  if (newFolderId !== folder.id) {
    batch.delete(doc(colRef, folder.id));
    numOps += 1;
  }
  if (numOps > 0) {
    await batch.commit();
  }
}

/**
 * Deletes an asset from the asset manager. Folders must be empty. The
 * underlying GCS file is left untouched since published docs may still
 * reference it.
 */
export async function deleteAsset(asset: Asset) {
  if (asset.type === 'folder') {
    const folderPath = joinFolderPath(asset.parent, asset.name);
    const children = await listAssets(folderPath);
    if (children.length > 0) {
      throw new Error('Folder is not empty.');
    }
  }
  await deleteDoc(doc(getAssetsDbCollection(), asset.id));
  logAction('asset.delete', {
    metadata: {assetId: asset.id, name: asset.name},
  });
}

/**
 * Replaces the file of an asset (e.g. uploading a new version). Preserves the
 * existing alt text when the new upload doesn't define one. Returns the
 * updated asset; callers should follow up with {@link syncAssetToDocs} to fan
 * the change out to docs that use the asset.
 */
export async function replaceAssetFile(
  asset: AssetFile,
  newFile: UploadedFile
): Promise<AssetFile> {
  const file = removeUndefinedValues(newFile);
  if (!file.alt && asset.file?.alt) {
    file.alt = asset.file.alt;
  }
  const docRef = doc(getAssetsDbCollection(), asset.id);
  await updateDoc(docRef, {
    file: file,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  logAction('asset.replace', {metadata: {assetId: asset.id, name: asset.name}});
  return (await getAsset(asset.id)) as AssetFile;
}

/**
 * Updates the alt text stored on an asset. Callers should follow up with
 * {@link syncAssetToDocs} to fan the change out to docs that use the asset.
 */
export async function updateAssetAltText(
  asset: AssetFile,
  altText: string
): Promise<AssetFile> {
  const docRef = doc(getAssetsDbCollection(), asset.id);
  await updateDoc(docRef, {
    'file.alt': altText || '',
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email,
  });
  return (await getAsset(asset.id)) as AssetFile;
}

/**
 * Builds the field value to embed in a doc when an asset is selected from the
 * asset manager. The full file data is copied into the doc (so fetching the
 * doc requires no extra RPCs) along with an `assetId` backlink used to keep
 * the copy in sync.
 */
export function buildAssetFieldValue(asset: AssetFile): AssetFieldValue {
  return {
    ...removeUndefinedValues(asset.file),
    assetId: asset.id,
  };
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
  // Ignore non-plain objects (e.g. Timestamps).
  if (typeof data.toMillis === 'function') {
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

/** Checks if a value looks like an asset-linked image/file field value. */
function isAssetFieldValue(data: any): data is AssetFieldValue {
  return typeof data?.assetId === 'string' && typeof data?.src === 'string';
}

/**
 * Finds all draft docs that use an asset by querying the `sys.assets` reverse
 * index across every collection in the project. Note that the index is
 * (re)computed whenever a doc draft is saved, so docs that haven't been saved
 * since the asset was selected may be missing (eventual consistency).
 */
export async function findDocsUsingAsset(assetId: string): Promise<CMSDoc[]> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const collectionIds = Object.keys(window.__ROOT_CTX.collections || {});
  const results = await Promise.all(
    collectionIds.map(async (collectionId) => {
      const colRef = collection(
        db,
        'Projects',
        projectId,
        'Collections',
        collectionId,
        'Drafts'
      );
      const q = query(colRef, where('sys.assets', 'array-contains', assetId));
      const snapshot = await getDocs(q);
      const docs: CMSDoc[] = [];
      snapshot.forEach((snap) => {
        docs.push(snap.data() as CMSDoc);
      });
      return docs;
    })
  );
  const docs = results.flat();
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Fans out an asset update to all draft docs that embed the asset, updating
 * the embedded file data copies in place. Docs are updated one by one
 * (eventual consistency); failures are collected and reported back so the
 * caller can surface them. Only draft docs are updated -- publishing a doc
 * propagates the change to the published copy as usual.
 *
 * Doc-level customizations are preserved: if a doc's embedded `alt` or
 * `canvasBgColor` was changed from the asset's previous value, the
 * customization is kept.
 */
export async function syncAssetToDocs(
  asset: AssetFile,
  options: {
    /** The asset's file data before the change (used to detect doc-level overrides). */
    previousFile?: UploadedFile;
    /** Limits the sync to the provided docs (defaults to all docs using the asset). */
    docs?: CMSDoc[];
  } = {}
): Promise<AssetSyncResult> {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docs = options.docs ?? (await findDocsUsingAsset(asset.id));
  const updatedDocIds: string[] = [];
  const failedDocIds: string[] = [];

  for (const cmsDoc of docs) {
    const paths: Array<{path: string; value: any}> = [];
    collectAssetFieldPaths(cmsDoc.fields, asset.id, 'fields', paths);
    if (paths.length === 0) {
      continue;
    }
    const updates: Record<string, any> = {};
    for (const match of paths) {
      updates[match.path] = buildSyncedFieldValue(
        asset,
        match.value,
        options.previousFile
      );
    }
    updates['sys.modifiedAt'] = serverTimestamp();
    updates['sys.modifiedBy'] = window.firebase.user.email;
    const [collectionId, slug] = cmsDoc.id.split('/');
    const draftDocRef = doc(
      db,
      'Projects',
      projectId,
      'Collections',
      collectionId,
      'Drafts',
      slug
    );
    try {
      await updateDoc(draftDocRef, updates);
      updatedDocIds.push(cmsDoc.id);
    } catch (err) {
      console.error(`failed to sync asset ${asset.id} to ${cmsDoc.id}:`, err);
      failedDocIds.push(cmsDoc.id);
    }
  }

  if (updatedDocIds.length > 0) {
    removeDocsFromCache(updatedDocIds);
    logAction('asset.sync', {
      metadata: {
        assetId: asset.id,
        name: asset.name,
        docIds: updatedDocIds,
      },
    });
  }
  return {updatedDocIds, failedDocIds};
}

/**
 * Walks a doc's marshaled fields data collecting the dot-notation db paths of
 * all embedded copies of an asset. Marshaled data stores arrays as keyed
 * objects (see `marshalArray()`), so every node is addressable with a
 * dot-notation path that can be used directly with `updateDoc()`.
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
  // Ignore non-plain objects (e.g. Timestamps).
  if (typeof data.toMillis === 'function') {
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

/**
 * Builds the new embedded field value for a doc when syncing an asset update,
 * preserving doc-level customizations (alt text, canvas bg color) that differ
 * from the asset's previous values.
 */
export function buildSyncedFieldValue(
  asset: AssetFile,
  existingValue: any,
  previousFile?: UploadedFile
): AssetFieldValue {
  const next = buildAssetFieldValue(asset);
  const prevAlt = previousFile?.alt ?? asset.file?.alt ?? '';
  const docAlt = existingValue?.alt || '';
  if (docAlt && docAlt !== prevAlt) {
    next.alt = docAlt;
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

/** Returns a copy of an object with `undefined` values removed. */
function removeUndefinedValues<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result as T;
}

function basename(path: string): string {
  return (path || '').split('?')[0].split('/').pop() || 'untitled';
}
