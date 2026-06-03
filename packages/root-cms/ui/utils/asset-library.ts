import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {UploadedFile, uploadFileToGCS} from './gcs.js';

export interface LibraryAssetFile extends UploadedFile {
  assetId: string;
  assetVersion: number;
}

export interface LibraryAsset {
  id: string;
  file: LibraryAssetFile;
  filename?: string;
  version: number;
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

export async function createLibraryAsset(file: File): Promise<LibraryAsset> {
  const id = crypto.randomUUID();
  const version = 1;
  const uploaded = await uploadFileToGCS(file, {
    uploadDir: `assets/${id}/v${version}`,
  });
  const assetFile = createLibraryFile(id, version, uploaded);
  const asset: LibraryAsset = {
    id,
    file: assetFile,
    filename: uploaded.filename || file.name,
    version,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || 'unknown',
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email || 'unknown',
  };
  await setDoc(assetDocRef(id), asset);
  return asset;
}

export async function saveFileAsLibraryAsset(
  file: UploadedFile
): Promise<LibraryAsset> {
  const id = crypto.randomUUID();
  const version = 1;
  const assetFile = createLibraryFile(id, version, file);
  const asset: LibraryAsset = {
    id,
    file: assetFile,
    filename: file.filename,
    version,
    createdAt: serverTimestamp(),
    createdBy: window.firebase.user.email || 'unknown',
    modifiedAt: serverTimestamp(),
    modifiedBy: window.firebase.user.email || 'unknown',
  };
  await setDoc(assetDocRef(id), asset);
  return asset;
}

export async function listLibraryAssets(max = 50): Promise<LibraryAsset[]> {
  const snapshot = await getDocs(
    query(assetCollectionRef(), orderBy('modifiedAt', 'desc'), limit(max))
  );
  return snapshot.docs.map((docSnap) => ({
    ...(docSnap.data() as LibraryAsset),
    id: docSnap.id,
  }));
}

export async function replaceLibraryAsset(assetId: string, file: File) {
  const assetRef = assetDocRef(assetId);
  const usageSnapshot = await getDocs(
    query(assetUsageCollectionRef(), where('assetId', '==', assetId))
  );
  const nextVersion = Date.now();
  const uploaded = await uploadFileToGCS(file, {
    uploadDir: `assets/${assetId}/v${nextVersion}`,
  });
  const assetFile = createLibraryFile(assetId, nextVersion, uploaded);
  const batch = writeBatch(window.firebase.db);
  batch.update(assetRef, {
    file: assetFile,
    filename: uploaded.filename || file.name,
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
