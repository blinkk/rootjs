/**
 * Client helpers for the GCS-backed asset library.
 *
 * Reads (assets/folders/usages) go directly to Firestore via the web SDK
 * (these docs are readable by VIEWER+). Mutations go through server-authoritative
 * `/cms/api/assets.*` endpoints, because security rules forbid client writes to
 * the usage indexes and the `Assets` collection for non-publishers.
 */
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  Asset,
  AssetFile,
  AssetFolder,
  isAssetRef,
  normalizeAssetDir,
} from '../../shared/asset.js';
import {collectPathsByPredicate} from '../../shared/marshal.js';

export interface AssetUsage {
  docId: string;
  collection: string;
  slug: string;
}

function getValueAtPath(obj: any, path: string): any {
  let current = obj;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/**
 * Returns the sorted, de-duped set of library asset ids referenced anywhere in
 * a doc's (stored/marshaled) `fields`. Used by the draft controller to decide
 * when to reconcile the usage index.
 */
export function collectAssetIds(fields: any): string[] {
  const ids = new Set<string>();
  const paths = collectPathsByPredicate(fields || {}, (n) => isAssetRef(n));
  for (const path of paths) {
    const value = getValueAtPath(fields, path);
    if (value?.assetId) {
      ids.add(value.assetId);
    }
  }
  return [...ids].sort();
}

function projectId(): string {
  return window.__ROOT_CTX.rootConfig.projectId;
}

async function postJson<T = any>(endpoint: string, body: any): Promise<T> {
  const res = await window.fetch(endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Fall back to the raw response text for the error message below.
  }
  if (!res.ok || data?.success === false) {
    const message = (data && (data.error || data.message)) || text;
    throw new Error(message || `request failed: ${endpoint}`);
  }
  return data?.data as T;
}

// ---------------------------------------------------------------------------
// Firestore reads.
// ---------------------------------------------------------------------------

function assetsCollection() {
  return collection(window.firebase.db, 'Projects', projectId(), 'Assets');
}

function assetFoldersCollection() {
  return collection(
    window.firebase.db,
    'Projects',
    projectId(),
    'AssetFolders'
  );
}

/** Lists assets, optionally filtered to a single folder (`dir`). */
export async function listAssets(dir?: string): Promise<Asset[]> {
  const coll = assetsCollection();
  const q =
    dir !== undefined
      ? query(coll, where('dir', '==', normalizeAssetDir(dir)))
      : coll;
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as Asset);
}

/** Reads a single asset. */
export async function getAsset(assetId: string): Promise<Asset | null> {
  const ref = doc(
    window.firebase.db,
    'Projects',
    projectId(),
    'Assets',
    assetId
  );
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? (snapshot.data() as Asset) : null;
}

/** Lists asset folders, optionally filtered to direct children of `parent`. */
export async function listAssetFolders(
  parent?: string
): Promise<AssetFolder[]> {
  const coll = assetFoldersCollection();
  const q =
    parent !== undefined
      ? query(coll, where('parent', '==', normalizeAssetDir(parent)))
      : coll;
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as AssetFolder);
}

function assetUsagesCollection(assetId: string) {
  return collection(
    window.firebase.db,
    'Projects',
    projectId(),
    'Assets',
    assetId,
    'Usages'
  );
}

/** Counts how many docs reference an asset (reverse-index count). */
export async function getAssetUsageCount(assetId: string): Promise<number> {
  const snapshot = await getCountFromServer(assetUsagesCollection(assetId));
  return snapshot.data().count;
}

/** Lists the docs that reference an asset. */
export async function getAssetUsages(assetId: string): Promise<AssetUsage[]> {
  const snapshot = await getDocs(assetUsagesCollection(assetId));
  return snapshot.docs.map((d) => d.data() as AssetUsage);
}

// ---------------------------------------------------------------------------
// API mutations (server-authoritative).
// ---------------------------------------------------------------------------

export function assetsCreate(file: AssetFile, dir?: string): Promise<Asset> {
  return postJson('/cms/api/assets.create', {file, dir});
}

export function assetsReplace(
  assetId: string,
  file: AssetFile
): Promise<{asset: Asset; docsUpdated: number}> {
  return postJson('/cms/api/assets.replace', {assetId, file});
}

export function assetsSetAlt(
  assetId: string,
  alt: string
): Promise<{asset: Asset; docsUpdated: number}> {
  return postJson('/cms/api/assets.setAlt', {assetId, alt});
}

export function assetsDelete(assetId: string, force?: boolean): Promise<void> {
  return postJson('/cms/api/assets.delete', {assetId, force});
}

export function assetsMove(assetId: string, dir: string): Promise<void> {
  return postJson('/cms/api/assets.move', {assetId, dir});
}

export function assetsRename(assetId: string, filename: string): Promise<void> {
  return postJson('/cms/api/assets.rename', {assetId, filename});
}

export function assetsCreateFolder(
  name: string,
  parent?: string
): Promise<AssetFolder> {
  return postJson('/cms/api/assets.createFolder', {name, parent});
}

export function assetsSyncUsages(docId: string): Promise<void> {
  return postJson('/cms/api/assets.syncUsages', {docId});
}

export function assetsPurgeDoc(docId: string): Promise<void> {
  return postJson('/cms/api/assets.purgeDoc', {docId});
}

export function assetsRebuildUsages(): Promise<{
  docsScanned: number;
  usages: number;
}> {
  return postJson('/cms/api/assets.rebuildUsages', {});
}
