/**
 * @fileoverview Server-side data layer for the asset library.
 *
 * Mirrors the CMS UI's asset library (`ui/utils/assets.ts`) for use from the
 * `RootCMSClient` and the `root-cms` CLI: files are uploaded to the project's
 * GCS bucket (and registered with the Google Cloud Image service when `gci`
 * is enabled), recorded at `Projects/<projectId>/Assets/<assetId>`, and
 * replacing a file fans the change out to every draft doc that embeds the
 * asset (found via the `sys.assets` reverse index).
 */

import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import {
  GCI_SUPPORTED_EXTS,
  PREVIEW_IMAGE_EXTS,
  VIDEO_EXTS,
  buildReplacedAssetFile,
  buildSyncedFieldValue,
  collectAssetFieldPaths,
  getFileExt,
  getFolderId,
  joinFolderPath,
  normalizeParentPath,
  parseFolderPath,
  removeUndefinedValues,
  replaceFileExt,
  validateAssetName,
  validateFolderPath,
  type AssetSyncResult,
  type UploadedFile,
} from '../shared/assets.js';
import type {
  Asset,
  RootCMSClient,
  SyncAssetToDocsOptions,
  UploadAssetOptions,
  UploadAssetResult,
} from './client.js';
import {getImageSize, type ImageSize} from './image-size.js';
import {getVideoSize} from './video-size.js';

/** Default hosted GCI service used when the plugin config sets `gci: true`. */
const DEFAULT_GCI_DOMAIN = 'https://services.rootjs.dev';

/** Default cache-control for uploaded files (365 days, content-addressed). */
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000';

/** Default user attributed to changes made through the client. */
const DEFAULT_MODIFIED_BY = 'root-cms-client';

/** Content types for common upload extensions. */
const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  gif: 'image/gif',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  html: 'text/html',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  m4a: 'audio/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  otf: 'font/otf',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ttf: 'font/ttf',
  txt: 'text/plain',
  vtt: 'text/vtt',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml',
  zip: 'application/zip',
};

/**
 * Server-side asset library for a Root CMS project. Accessed through the
 * `RootCMSClient` asset methods (e.g. `cmsClient.uploadAsset()`).
 */
export class AssetLibrary {
  private readonly cmsClient: RootCMSClient;

  constructor(cmsClient: RootCMSClient) {
    this.cmsClient = cmsClient;
  }

  private get db() {
    return this.cmsClient.db;
  }

  private get projectId() {
    return this.cmsClient.projectId;
  }

  private assetsCollection() {
    return this.db.collection(`Projects/${this.projectId}/Assets`);
  }

  /** Fetches a single asset by id. */
  async getAsset(assetId: string): Promise<Asset | null> {
    if (!assetId) {
      throw new Error('assetId is required');
    }
    const snapshot = await this.assetsCollection().doc(assetId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as Asset;
  }

  /** Lists the assets (folders first, then files) directly within a folder. */
  async listAssets(folder = ''): Promise<Asset[]> {
    const parent = normalizeParentPath(folder);
    const snapshot = await this.assetsCollection()
      .where('parent', '==', parent)
      .get();
    const assets: Asset[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (isValidAsset(data)) {
        assets.push(data);
      }
    });
    return assets.sort((a, b) => {
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
   * Finds the file asset named `name` directly within a folder, or null if
   * the folder has no file by that name.
   */
  async findAssetFile(folder: string, name: string): Promise<Asset | null> {
    const snapshot = await this.assetsCollection()
      .where('parent', '==', normalizeParentPath(folder))
      .where('name', '==', name)
      .get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (isValidAsset(data) && data.type === 'file') {
        return data;
      }
    }
    return null;
  }

  /**
   * Uploads a file to GCS and adds it to the asset library. If the folder
   * already contains a file with the same name (or `options.assetId` is set),
   * the existing asset's file is replaced and the change is fanned out to all
   * draft docs that embed the asset.
   */
  async uploadAsset(
    source: string | Uint8Array,
    options: UploadAssetOptions = {}
  ): Promise<UploadAssetResult> {
    const modifiedBy = options.modifiedBy || DEFAULT_MODIFIED_BY;
    let bytes: Uint8Array;
    let filename: string;
    if (typeof source === 'string') {
      bytes = await readFile(source);
      filename = options.filename || path.basename(source);
    } else {
      if (!options.filename) {
        throw new Error('options.filename is required when uploading bytes');
      }
      bytes = source;
      filename = options.filename;
    }
    filename = validateAssetName(filename);

    // Resolve the asset to replace, if any.
    let existing: Asset | null;
    let folder: string;
    if (options.assetId) {
      existing = await this.getAsset(options.assetId);
      if (!existing || existing.type !== 'file') {
        throw new Error(`asset not found: ${options.assetId}`);
      }
      folder = existing.parent || '';
    } else {
      folder = validateFolderPath(options.folder || '');
      const name = validateAssetName(options.name || filename);
      existing = await this.findAssetFile(folder, name);
    }

    const namingMode =
      options.namingMode ??
      ((await this.hasPreserveFilename(folder)) ? 'hash-path' : 'hash');
    const uploadedFile = await this.uploadFile(bytes, filename, {
      namingMode,
      cacheControl: options.cacheControl,
      disableGci: options.disableGci,
      uploadedBy: modifiedBy,
    });
    if (options.alt !== undefined) {
      uploadedFile.alt = options.alt;
    }

    if (existing) {
      const previousFile = existing.file;
      const asset = await this.replaceAssetFile(existing, uploadedFile, {
        modifiedBy,
      });
      const result: UploadAssetResult = {asset, status: 'replaced'};
      if (options.syncDocs !== false) {
        result.sync = await this.syncAssetToDocs(asset, {
          previousFile,
          modifiedBy,
        });
      }
      return result;
    }

    await this.ensureFolders(folder, modifiedBy);
    const asset = await this.createAssetFile({
      folder,
      name: options.name || filename,
      file: uploadedFile,
      modifiedBy,
    });
    return {asset, status: 'created'};
  }

  /**
   * Returns true if `folderPath` or any of its ancestors has the "preserve
   * filename" setting enabled (see `AssetFolder.preserveFilename` in the UI).
   */
  private async hasPreserveFilename(folderPath: string): Promise<boolean> {
    const segments = parseFolderPath(folderPath);
    if (segments.length === 0) {
      return false;
    }
    const paths = segments.map((_, i) => segments.slice(0, i + 1).join('/'));
    const folders = await Promise.all(
      paths.map((p) => this.getAsset(getFolderId(p)))
    );
    return folders.some(
      (folder) => folder?.type === 'folder' && !!folder.preserveFilename
    );
  }

  /**
   * Ensures a folder (and its ancestors) exist in the asset library so that
   * uploaded files show up in the folder listing. Existing folders are left
   * untouched.
   */
  private async ensureFolders(folderPath: string, modifiedBy: string) {
    const segments = parseFolderPath(folderPath);
    if (segments.length === 0) {
      return;
    }
    const paths = segments.map((_, i) => segments.slice(0, i + 1).join('/'));
    const colRef = this.assetsCollection();
    const snapshots = await Promise.all(
      paths.map((p) => colRef.doc(getFolderId(p)).get())
    );
    const missing = paths.filter((_, i) => !snapshots[i].exists);
    if (missing.length === 0) {
      return;
    }
    const batch = this.db.batch();
    const now = Timestamp.now();
    for (const folder of missing) {
      const folderSegments = parseFolderPath(folder);
      const folderId = getFolderId(folder);
      batch.set(colRef.doc(folderId), {
        id: folderId,
        type: 'folder',
        parent: folderSegments.slice(0, -1).join('/'),
        name: folderSegments[folderSegments.length - 1],
        createdAt: now,
        createdBy: modifiedBy,
        modifiedAt: now,
        modifiedBy: modifiedBy,
      });
    }
    await batch.commit();
    await this.cmsClient.logAction('asset.folder_create', {
      by: modifiedBy,
      metadata: {folders: missing},
    });
  }

  private async createAssetFile(options: {
    folder: string;
    name: string;
    file: UploadedFile;
    modifiedBy: string;
  }): Promise<Asset> {
    const name = validateAssetName(options.name);
    const assetId = autokey(12);
    const now = Timestamp.now();
    const asset: Asset = {
      id: assetId,
      type: 'file',
      parent: normalizeParentPath(options.folder),
      name: name,
      file: removeUndefinedValues(options.file),
      createdAt: now,
      createdBy: options.modifiedBy,
      modifiedAt: now,
      modifiedBy: options.modifiedBy,
    };
    await this.assetsCollection().doc(assetId).set(asset);
    await this.cmsClient.logAction('asset.upload', {
      by: options.modifiedBy,
      metadata: {assetId, name, path: joinFolderPath(asset.parent, name)},
    });
    return asset;
  }

  /**
   * Replaces the file of an existing asset, preserving its alt text settings
   * and updating the display name's extension to match the new file.
   */
  private async replaceAssetFile(
    asset: Asset,
    newFile: UploadedFile,
    options: {modifiedBy: string}
  ): Promise<Asset> {
    const file = buildReplacedAssetFile(asset.file, newFile);
    const updates: Record<string, any> = {
      file: file,
      modifiedAt: Timestamp.now(),
      modifiedBy: options.modifiedBy,
    };
    const newExt = getFileExt(file.filename || file.src || '');
    const newName = replaceFileExt(asset.name, newExt);
    if (newName !== asset.name) {
      updates.name = newName;
    }
    await this.assetsCollection().doc(asset.id).update(updates);
    await this.cmsClient.logAction('asset.replace', {
      by: options.modifiedBy,
      metadata: {
        assetId: asset.id,
        name: asset.name,
        path: joinFolderPath(
          normalizeParentPath(asset.parent),
          updates.name || asset.name
        ),
      },
    });
    return {...asset, ...updates} as Asset;
  }

  /**
   * Uploads file bytes to the project's GCS bucket, returning the file data
   * to store on the asset (the same shape the CMS UI stores). Images are
   * registered with the Google Cloud Image service when `gci` is enabled.
   */
  async uploadFile(
    bytes: Uint8Array,
    filename: string,
    options: {
      namingMode?: 'hash' | 'hash-path' | 'clean';
      cacheControl?: string;
      disableGci?: boolean;
      uploadedBy?: string;
    } = {}
  ): Promise<UploadedFile> {
    const cmsConfig = this.cmsClient.cmsPlugin.getConfig();
    const bucketName = cmsConfig.firebaseConfig?.storageBucket;
    if (!bucketName) {
      throw new Error(
        'missing firebaseConfig.storageBucket in the cmsPlugin() config'
      );
    }
    const ext = getFileExt(filename);
    const hash = crypto.createHash('sha1').update(bytes).digest('hex');
    const gcsFilename = getGcsFilename(filename, hash, ext, options.namingMode);
    const objectPath = `${this.projectId}/uploads/${gcsFilename}`;
    const gcsPath = `/${bucketName}/${objectPath}`;

    const meta: Record<string, string | number> = {
      filename: filename,
      uploadedBy: options.uploadedBy || DEFAULT_MODIFIED_BY,
      uploadedAt: String(Date.now()),
    };
    let size: ImageSize | null = null;
    if (PREVIEW_IMAGE_EXTS.includes(ext)) {
      size = getImageSize(bytes, ext);
    } else if (VIDEO_EXTS.includes(ext)) {
      size = getVideoSize(bytes);
    }
    if (size) {
      meta.width = size.width;
      meta.height = size.height;
    }

    const bucket = await this.getBucket(bucketName);
    await bucket.file(objectPath).save(Buffer.from(bytes), {
      resumable: false,
      contentType: CONTENT_TYPES[ext] || 'application/octet-stream',
      metadata: {
        cacheControl: options.cacheControl || DEFAULT_CACHE_CONTROL,
        metadata: Object.fromEntries(
          Object.entries(meta).map(([key, value]) => [key, String(value)])
        ),
      },
    });

    let src = `https://storage.googleapis.com${gcsPath}`;
    const file: UploadedFile = {...meta, src} as UploadedFile;
    const gciDomain = getGciDomain(cmsConfig.gci);
    if (gciDomain && !options.disableGci && GCI_SUPPORTED_EXTS.includes(ext)) {
      const gciUrl = await fetchGciUrl(gciDomain, gcsPath);
      if (gciUrl) {
        src = gciUrl;
        file.gcsPath = gcsPath;
      }
    }
    file.src = src;
    return file;
  }

  private async getBucket(bucketName: string) {
    let storageModule: typeof import('firebase-admin/storage');
    try {
      storageModule = await import('firebase-admin/storage');
    } catch (err) {
      throw new Error(
        'failed to load firebase-admin/storage. make sure the ' +
          '"@google-cloud/storage" package is installed.',
        {cause: err}
      );
    }
    return storageModule.getStorage(this.cmsClient.app).bucket(bucketName);
  }

  /**
   * Returns the ids (e.g. `Pages/home`) of all draft docs that embed an asset,
   * found via the `sys.assets` reverse index. The index is maintained when a
   * draft is saved in the CMS UI or through the client (see `setRawDoc()`).
   */
  async findDocsUsingAsset(assetId: string): Promise<string[]> {
    const docs = await this.queryDocsUsingAsset(assetId);
    return docs.map((doc) => doc.id);
  }

  private async queryDocsUsingAsset(
    assetId: string
  ): Promise<Array<{id: string; ref: any; fields: any}>> {
    const collectionIds = await this.listCollectionIds();
    const results = await Promise.all(
      collectionIds.map(async (collectionId) => {
        const snapshot = await this.db
          .collection(
            `Projects/${this.projectId}/Collections/${collectionId}/Drafts`
          )
          .where('sys.assets', 'array-contains', assetId)
          .get();
        return snapshot.docs.map((doc) => ({
          id: `${collectionId}/${doc.id}`,
          ref: doc.ref,
          fields: doc.data()?.fields || {},
        }));
      })
    );
    return results.flat().sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Lists the ids of the project's content collections. Collection parent
   * docs aren't written by the CMS, so `listDocuments()` is used since it
   * also returns "missing" docs that only contain subcollections.
   */
  private async listCollectionIds(): Promise<string[]> {
    const refs = await this.db
      .collection(`Projects/${this.projectId}/Collections`)
      .listDocuments();
    return refs.map((ref) => ref.id);
  }

  /**
   * Fans out an asset update to all draft docs that embed the asset, updating
   * the embedded file data copies in place. Docs are updated one by one
   * (eventual consistency); failures are collected and returned. Doc-level
   * alt text and canvas bg color customizations are preserved.
   */
  async syncAssetToDocs(
    assetOrId: Asset | string,
    options: SyncAssetToDocsOptions = {}
  ): Promise<AssetSyncResult> {
    const asset =
      typeof assetOrId === 'string'
        ? await this.getAsset(assetOrId)
        : assetOrId;
    if (!asset || asset.type !== 'file' || !asset.file) {
      throw new Error(
        `asset not found: ${typeof assetOrId === 'string' ? assetOrId : assetOrId?.id}`
      );
    }
    const assetFile = {id: asset.id, file: asset.file};
    const modifiedBy = options.modifiedBy || DEFAULT_MODIFIED_BY;
    const docs = await this.queryDocsUsingAsset(asset.id);
    const updatedDocIds: string[] = [];
    const failedDocIds: string[] = [];
    for (const doc of docs) {
      const paths: Array<{path: string; value: any}> = [];
      collectAssetFieldPaths(doc.fields, asset.id, 'fields', paths);
      if (paths.length === 0) {
        continue;
      }
      const updates: Record<string, any> = {};
      for (const match of paths) {
        updates[match.path] = buildSyncedFieldValue(
          assetFile,
          match.value,
          options.previousFile
        );
      }
      updates['sys.modifiedAt'] = Timestamp.now();
      updates['sys.modifiedBy'] = modifiedBy;
      try {
        await doc.ref.update(updates);
        updatedDocIds.push(doc.id);
      } catch (err) {
        console.error(`failed to sync asset ${asset.id} to ${doc.id}:`, err);
        failedDocIds.push(doc.id);
      }
    }
    if (updatedDocIds.length > 0) {
      await this.cmsClient.logAction('asset.sync', {
        by: modifiedBy,
        metadata: {
          assetId: asset.id,
          name: asset.name,
          path: joinFolderPath(normalizeParentPath(asset.parent), asset.name),
          docIds: updatedDocIds,
        },
      });
    }
    return {updatedDocIds, failedDocIds};
  }
}

/** Drops docs that don't look like proper Asset entries. */
function isValidAsset(data: any): data is Asset {
  return (
    !!data &&
    typeof data.name === 'string' &&
    (data.type === 'file' || data.type === 'folder')
  );
}

/** Returns the GCS object filename, mirroring `ui/utils/gcs.ts`. */
function getGcsFilename(
  filename: string,
  hash: string,
  ext: string,
  namingMode?: 'hash' | 'hash-path' | 'clean'
) {
  if (namingMode === 'clean') {
    return filename;
  }
  if (namingMode === 'hash-path') {
    return `${hash}/${filename}`;
  }
  return `${hash}.${ext}`;
}

/** Resolves the `gci` plugin option into a service URL (or '' if disabled). */
function getGciDomain(gci?: string | boolean): string {
  if (gci === true) {
    return DEFAULT_GCI_DOMAIN;
  }
  return gci ? String(gci).replace(/\/+$/, '') : '';
}

/** Requests a Google Cloud Image serving URL for an uploaded GCS object. */
async function fetchGciUrl(gciDomain: string, gcsPath: string) {
  const params = new URLSearchParams({gcs: gcsPath});
  const url = `${gciDomain}/_/serving_url?${params.toString()}`;
  const res = await fetch(url);
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error(`failed to get gci url (${res.status}): ${url}\n${text}`);
  }
  const data = (await res.json()) as {servingUrl?: string};
  return data.servingUrl || '';
}

/** Generates a random id, matching the CMS UI's `autokey()` format. */
function autokey(len: number) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars.charAt(crypto.randomInt(chars.length));
  }
  return result;
}
