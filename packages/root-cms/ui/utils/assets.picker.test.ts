import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  Asset,
  resolveAssetPickerFolder,
  setAssetPickerLastFolder,
} from './assets.js';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {now: () => ({type: 'timestamp'})},
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

/** The asset docs the mocked `getDoc()` reads from, keyed by asset id. */
let assetDocs: Record<string, Asset> = {};

function testFile(id: string, parent: string, name: string): Asset {
  return {id: id, type: 'file', parent: parent, name: name} as Asset;
}

/** Simulates opening a new browser tab (a fresh `sessionStorage`). */
function newTabSession() {
  sessionStorage.clear();
}

describe('resolveAssetPickerFolder', () => {
  const originalCtx = window.__ROOT_CTX;

  beforeEach(() => {
    vi.clearAllMocks();
    window.__ROOT_CTX = {rootConfig: {projectId: 'test-project'}} as any;
    window.firebase = {db: {type: 'mock-db'}} as any;
    newTabSession();
    assetDocs = {
      'asset-a': testFile('asset-a', 'folderA', 'a.png'),
      'asset-b': testFile('asset-b', 'folderB', 'b.png'),
      'asset-root': testFile('asset-root', '', 'root.png'),
    };
    mocks.collection.mockImplementation(
      (_db: unknown, ...path: string[]) => `col:${path.join('/')}`
    );
    mocks.doc.mockImplementation((_colRef: unknown, id: string) => ({id: id}));
    mocks.getDoc.mockImplementation(async (ref: any) => {
      const asset = assetDocs[ref.id];
      return {
        exists: () => Boolean(asset),
        data: () => asset,
      };
    });
  });

  afterEach(() => {
    window.__ROOT_CTX = originalCtx;
    newTabSession();
  });

  it("opens the folder of the field's asset in a new tab session", async () => {
    expect(await resolveAssetPickerFolder('asset-a')).toEqual('folderA');
  });

  it('opens the last visited folder for subsequent fields in the same tab', async () => {
    // Field A holds an asset from folder A, field B one from folder B.
    // Open field A: no folder visited yet this tab, so it opens folder A.
    expect(await resolveAssetPickerFolder('asset-a')).toEqual('folderA');

    // The user picks a file from folder A. The browser records the folder.
    setAssetPickerLastFolder('folderA');

    // Opening field B keeps the user in folder A, not field B's folder B.
    expect(await resolveAssetPickerFolder('asset-b')).toEqual('folderA');

    // ...and it doesn't need to look field B's asset up at all.
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
  });

  it("starts over from the field's asset folder in a new tab session", async () => {
    setAssetPickerLastFolder('folderA');
    expect(await resolveAssetPickerFolder('asset-b')).toEqual('folderA');

    newTabSession();
    expect(await resolveAssetPickerFolder('asset-b')).toEqual('folderB');
  });

  it('remembers the project root over the asset folder', async () => {
    setAssetPickerLastFolder('');
    expect(await resolveAssetPickerFolder('asset-a')).toEqual('');
  });

  it('opens the last visited folder for an empty field', async () => {
    expect(await resolveAssetPickerFolder(undefined)).toEqual('');

    setAssetPickerLastFolder('folderA');
    expect(await resolveAssetPickerFolder(undefined)).toEqual('folderA');
  });

  it('falls back to the project root for an asset in the root', async () => {
    expect(await resolveAssetPickerFolder('asset-root')).toEqual('');
  });

  it('falls back to the project root when the asset is missing', async () => {
    expect(await resolveAssetPickerFolder('asset-gone')).toEqual('');
  });

  it('falls back to the project root when the asset lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getDoc.mockRejectedValue(new Error('permission-denied'));

    expect(await resolveAssetPickerFolder('asset-a')).toEqual('');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
