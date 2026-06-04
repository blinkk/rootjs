import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {QueryConstraint} from 'firebase/firestore';
import {uploadFileToGCS} from './gcs.js';
import type {UploadedFile, UploadFileOptions} from './gcs.js';

export const DEFAULT_ASSET_FOLDER = 'uploads';

export interface LibraryAssetFile extends UploadedFile {
  assetId: string;
  assetVersion: number;
}

export interface LibraryAsset {
  id: string;
  file: LibraryAssetFile;
  filename?: string;
  folder?: string;
  path?: string;
  version: number;
  createdAt?: unknown;
  createdBy?: string;
  modifiedAt?: unknown;
  modifiedBy?: string;
}

export interface LibraryAssetFolder {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  createdAt?: unknown;
  createdBy?: string;
  modifiedAt?: unknown;
  modifiedBy?: string;
}

interface AssetUsageRef {
  assetId: string;
  assetVersion?: number;
  path: string;
}

export interface AssetUsage extends AssetUsageRef {
  id: string;
  docId: string;
  mode: 'draft' | 'published' | 'scheduled';
  collection: string;
  slug: string;
}

export function createLibraryFile(
  assetId: string,
  version: number,
  file: UploadedFile
): LibraryAssetFile {
  return {...file, assetId, assetVersion: version};
}

export async function createLibraryAsset(
  file: File,
  options?: {
    folder?: string;
    uploadOptions?: UploadFileOptions;
  }
): Promise<LibraryAsset> {
  const id = crypto.randomUUID();
  const version = 1;
  const folder = normalizeAssetFolderPath(options?.folder);
  const uploaded = await uploadFileToGCS(file, {
    ...options?.uploadOptions,
    uploadDir: folder,
  });
  const assetFile = createLibraryFile(id, version, uploaded);
  const filename = uploaded.filename || file.name;
  const asset: LibraryAsset = {
    id,
    file: assetFile,
    filename,
    folder,
    path: assetPath(folder, filename),
    version,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || 'unknown',
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email || 'unknown',
  };
  const batch = writeBatch(window.firebase.db);
  setAssetFolderDocsInBatch(batch, folder);
  batch.set(assetDocRef(id), asset);
  await batch.commit();
  return asset;
}

export async function saveFileAsLibraryAsset(
  file: UploadedFile,
  folderPath?: string
): Promise<LibraryAsset> {
  const id = crypto.randomUUID();
  const version = 1;
  const folder = normalizeAssetFolderPath(folderPath);
  const assetFile = createLibraryFile(id, version, file);
  const filename = file.filename || id;
  const asset: LibraryAsset = {
    id,
    file: assetFile,
    filename,
    folder,
    path: assetPath(folder, filename),
    version,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || 'unknown',
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email || 'unknown',
  };
  const batch = writeBatch(window.firebase.db);
  setAssetFolderDocsInBatch(batch, folder);
  batch.set(assetDocRef(id), asset);
  await batch.commit();
  return asset;
}

export async function createAssetFolder(
  folderPath: string
): Promise<LibraryAssetFolder> {
  const folder = normalizeAssetFolderPath(folderPath);
  const batch = writeBatch(window.firebase.db);
  setAssetFolderDocsInBatch(batch, folder);
  await batch.commit();
  return folderFromPath(folder);
}

export async function listLibraryAssets(max?: number): Promise<LibraryAsset[]> {
  const constraints: QueryConstraint[] = [orderBy('modifiedAt', 'desc')];
  if (max) {
    constraints.push(limit(max));
  }
  const snapshot = await getDocs(query(assetCollectionRef(), ...constraints));
  return snapshot.docs.map((docSnap) => ({
    ...(docSnap.data() as LibraryAsset),
    id: docSnap.id,
  }));
}

export async function listLibraryAssetFolders(): Promise<LibraryAssetFolder[]> {
  const snapshot = await getDocs(
    query(assetFolderCollectionRef(), orderBy('path', 'asc'))
  );
  const foldersByPath = new Map<string, LibraryAssetFolder>();
  foldersByPath.set(DEFAULT_ASSET_FOLDER, folderFromPath(DEFAULT_ASSET_FOLDER));
  snapshot.docs.forEach((docSnap) => {
    const folder = docSnap.data() as LibraryAssetFolder;
    foldersByPath.set(folder.path, {...folder, id: docSnap.id});
  });
  return [...foldersByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
}

export async function replaceLibraryAsset(assetId: string, file: File) {
  const assetRef = assetDocRef(assetId);
  const usageSnapshot = await getDocs(
    query(assetUsageCollectionRef(), where('assetId', '==', assetId))
  );
  const existingAsset = (await getDoc(assetRef)).data() as
    | LibraryAsset
    | undefined;
  const folder = normalizeAssetFolderPath(existingAsset?.folder);
  const nextVersion = Date.now();
  const uploaded = await uploadFileToGCS(file, {
    uploadDir: folder,
  });
  const assetFile = createLibraryFile(assetId, nextVersion, uploaded);
  const filename = uploaded.filename || file.name;
  const batch = writeBatch(window.firebase.db);
  batch.update(assetRef, {
    file: assetFile,
    filename,
    folder,
    path: assetPath(folder, filename),
    version: nextVersion,
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email || 'unknown',
  });
  usageSnapshot.docs.forEach((usageDoc) => {
    const usage = usageDoc.data() as AssetUsage;
    batch.update(docRefForUsage(usage), {
      [`fields.${usage.path}`]: assetFile,
      'sys.modifiedAt': serverTimestamp(),
      'sys.modifiedBy': window.firebase.user.email || 'unknown',
    });
    batch.update(usageDoc.ref, {
      assetVersion: nextVersion,
      modifiedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export function normalizeAssetFolderPath(folderPath?: string): string {
  const normalized = (folderPath || DEFAULT_ASSET_FOLDER)
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return DEFAULT_ASSET_FOLDER;
  }
  if (normalized.some((part) => part === '.' || part === '..')) {
    throw new Error('Folder names cannot be "." or "..".');
  }
  return normalized.join('/');
}

export function getLibraryAssetFolder(asset: LibraryAsset): string {
  return normalizeAssetFolderPath(asset.folder);
}

export function getLibraryAssetPath(asset: LibraryAsset): string {
  const folder = getLibraryAssetFolder(asset);
  const filename = asset.filename || asset.file.filename || asset.id;
  return asset.path || assetPath(folder, filename);
}

export async function syncDocAssetUsages(
  docId: string,
  fields: any,
  mode: AssetUsage['mode']
) {
  const [collectionId, slug] = docId.split('/');
  const nextRefs = extractAssetRefs(fields);
  const usageCollection = assetUsageCollectionRef();
  const existingSnapshot = await getDocs(
    query(
      usageCollection,
      where('docId', '==', docId),
      where('mode', '==', mode)
    )
  );
  const batch = writeBatch(window.firebase.db);
  existingSnapshot.docs.forEach((usageDoc) => batch.delete(usageDoc.ref));
  nextRefs.forEach((ref) => {
    const usageId = assetUsageId(mode, docId, ref.path);
    batch.set(doc(usageCollection, usageId), {
      ...ref,
      id: usageId,
      docId,
      mode,
      collection: collectionId,
      slug,
      modifiedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export function extractAssetRefs(value: any, path = ''): AssetUsageRef[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (!Array.isArray(value) && typeof value.assetId === 'string') {
    return [
      {
        assetId: value.assetId,
        assetVersion:
          typeof value.assetVersion === 'number'
            ? value.assetVersion
            : undefined,
        path,
      },
    ];
  }
  const refs: AssetUsageRef[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      refs.push(...extractAssetRefs(item, appendPath(path, String(index))));
    });
  } else {
    for (const key in value) {
      refs.push(...extractAssetRefs(value[key], appendPath(path, key)));
    }
  }
  return refs;
}

export function clearDocAssetUsages(
  docId: string,
  mode: AssetUsage['mode']
) {
  return syncDocAssetUsages(docId, {}, mode);
}

function appendPath(path: string, key: string) {
  return path ? `${path}.${key}` : key;
}

function assetUsageId(mode: string, docId: string, path: string) {
  return encodeURIComponent(`${mode}:${docId}:${path}`);
}

function assetPath(folder: string, filename: string) {
  return `${normalizeAssetFolderPath(folder)}/${filename}`;
}

function folderFromPath(folderPath: string): LibraryAssetFolder {
  const path = normalizeAssetFolderPath(folderPath);
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  return {
    id: assetFolderId(path),
    path,
    name,
    parentPath,
  };
}

function setAssetFolderDocsInBatch(
  batch: ReturnType<typeof writeBatch>,
  folderPath: string
) {
  const parts = normalizeAssetFolderPath(folderPath).split('/');
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/');
    const folder = folderFromPath(path);
    batch.set(
      assetFolderDocRef(path),
      {
        ...folder,
        modifiedAt: serverTimestamp(),
        modifiedBy: window.firebase.user.email || 'unknown',
      },
      {merge: true}
    );
  }
}

function assetCollectionRef() {
  return collection(
    window.firebase.db,
    'Projects',
    window.__ROOT_CTX.rootConfig.projectId,
    'Assets'
  );
}

function assetDocRef(assetId: string) {
  return doc(assetCollectionRef(), assetId);
}

function assetFolderCollectionRef() {
  return collection(
    window.firebase.db,
    'Projects',
    window.__ROOT_CTX.rootConfig.projectId,
    'AssetFolders'
  );
}

function assetFolderDocRef(folderPath: string) {
  return doc(assetFolderCollectionRef(), assetFolderId(folderPath));
}

function assetFolderId(folderPath: string) {
  return encodeURIComponent(normalizeAssetFolderPath(folderPath));
}

function assetUsageCollectionRef() {
  return collection(
    window.firebase.db,
    'Projects',
    window.__ROOT_CTX.rootConfig.projectId,
    'AssetUsages'
  );
}

function docRefForUsage(usage: AssetUsage) {
  return doc(
    window.firebase.db,
    'Projects',
    window.__ROOT_CTX.rootConfig.projectId,
    'Collections',
    usage.collection,
    usage.mode === 'published'
      ? 'Published'
      : usage.mode === 'scheduled'
        ? 'Scheduled'
        : 'Drafts',
    usage.slug
  );
}
