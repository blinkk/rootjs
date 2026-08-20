import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  Asset,
  AssetFolder,
  FolderNotEmptyError,
  countFolderContents,
  deleteAsset,
} from './assets.js';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  logAction: vi.fn(),
  query: vi.fn(),
  removeDocsFromCache: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {now: () => ({type: 'timestamp'})},
  collection: mocks.collection,
  deleteDoc: mocks.deleteDoc,
  deleteField: mocks.deleteField,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: mocks.limit,
  query: mocks.query,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  where: mocks.where,
  writeBatch: mocks.writeBatch,
}));

vi.mock('./actions.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('./doc-cache.js', () => ({
  removeDocsFromCache: mocks.removeDocsFromCache,
}));

/** The asset docs the mocked firestore queries read from. */
let assetDocs: Asset[] = [];
/** Ids passed to `deleteDoc()`. */
let deletedIds: string[] = [];
/** Ids deleted per committed write batch. */
let batchCommits: string[][] = [];

function testFolder(parent: string, name: string): AssetFolder {
  const path = parent ? `${parent}/${name}` : name;
  return {
    id: `folder-${path}`,
    type: 'folder',
    parent: parent,
    name: name,
  } as AssetFolder;
}

function testFile(parent: string, name: string): Asset {
  return {
    id: `file-${parent}-${name}`,
    type: 'file',
    parent: parent,
    name: name,
  } as Asset;
}

/** Applies a mocked `where()` constraint to an in-memory asset doc. */
function testConstraint(asset: any, constraint: any): boolean {
  const value = asset[constraint.field];
  if (constraint.op === '==') {
    return value === constraint.value;
  }
  if (constraint.op === '>=') {
    return value >= constraint.value;
  }
  if (constraint.op === '<=') {
    return value <= constraint.value;
  }
  return true;
}

/** Wires the firestore mocks up to the in-memory `assetDocs`. */
function setupFirestoreMocks() {
  vi.clearAllMocks();
  assetDocs = [];
  deletedIds = [];
  batchCommits = [];
  window.__ROOT_CTX = {rootConfig: {projectId: 'test-project'}} as any;
  window.firebase = {
    db: {type: 'mock-db'},
    user: {email: 'editor@example.com'},
  } as any;
  mocks.collection.mockImplementation(
    (_db: unknown, ...path: string[]) => `col:${path.join('/')}`
  );
  mocks.doc.mockImplementation((_colRef: unknown, id: string) => ({id: id}));
  mocks.where.mockImplementation((field: string, op: string, value: any) => ({
    field: field,
    op: op,
    value: value,
  }));
  mocks.query.mockImplementation((_colRef: unknown, ...constraints: any[]) => ({
    constraints: constraints,
  }));
  mocks.getDocs.mockImplementation(async (q: any) => {
    const matches = assetDocs.filter((asset) =>
      (q.constraints || []).every((constraint: any) =>
        testConstraint(asset, constraint)
      )
    );
    return {
      forEach: (cb: (snap: any) => void) =>
        matches.forEach((asset) => cb({data: () => asset})),
    };
  });
  mocks.deleteDoc.mockImplementation(async (ref: any) => {
    deletedIds.push(ref.id);
  });
  mocks.writeBatch.mockImplementation(() => {
    const ops: string[] = [];
    return {
      delete: (ref: any) => ops.push(ref.id),
      set: () => {},
      update: () => {},
      commit: async () => {
        batchCommits.push([...ops]);
        deletedIds.push(...ops);
        ops.length = 0;
      },
    };
  });
}

describe('deleteAsset', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('deletes an empty folder', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [folder];

    await deleteAsset(folder);

    expect(deletedIds).toEqual(['folder-marketing']);
  });

  it('throws a FolderNotEmptyError for a non-empty folder', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [folder, testFile('marketing', 'hero.png')];

    await expect(deleteAsset(folder)).rejects.toThrow(FolderNotEmptyError);
    expect(deletedIds).toEqual([]);
  });

  it('recursively deletes a folder and its descendants', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [
      folder,
      testFile('marketing', 'hero.png'),
      testFolder('marketing', 'q1'),
      testFile('marketing/q1', 'banner.png'),
      testFolder('marketing/q1', 'social'),
      testFile('marketing/q1/social', 'og.png'),
    ];

    await deleteAsset(folder, {recursive: true});

    expect(deletedIds.sort()).toEqual(
      [
        'file-marketing-hero.png',
        'file-marketing/q1-banner.png',
        'file-marketing/q1/social-og.png',
        'folder-marketing',
        'folder-marketing/q1',
        'folder-marketing/q1/social',
      ].sort()
    );
  });

  it('leaves folders that merely share a name prefix alone', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [
      folder,
      testFile('marketing', 'hero.png'),
      testFolder('', 'marketing-archive'),
      testFile('marketing-archive', 'old.png'),
    ];

    await deleteAsset(folder, {recursive: true});

    expect(deletedIds.sort()).toEqual(
      ['file-marketing-hero.png', 'folder-marketing'].sort()
    );
  });

  it('splits large recursive deletes across multiple write batches', async () => {
    const folder = testFolder('', 'marketing');
    const files = Array.from({length: 900}, (_unused, i) =>
      testFile('marketing', `file-${i}.png`)
    );
    assetDocs = [folder, ...files];

    await deleteAsset(folder, {recursive: true});

    expect(batchCommits.map((ops) => ops.length)).toEqual([400, 400, 100]);
    expect(deletedIds).toHaveLength(901);
  });

  it('records the number of deleted descendants in the action log', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [folder, testFile('marketing', 'hero.png')];

    await deleteAsset(folder, {recursive: true});

    expect(mocks.logAction).toHaveBeenCalledWith('asset.delete', {
      metadata: {
        assetId: 'folder-marketing',
        name: 'marketing',
        folder: 'marketing',
        numDescendants: 1,
      },
    });
  });

  it('deletes a file without querying for descendants', async () => {
    const file = testFile('marketing', 'hero.png');
    assetDocs = [file];

    await deleteAsset(file);

    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(deletedIds).toEqual(['file-marketing-hero.png']);
  });
});

describe('countFolderContents', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('counts nested files and folders at any depth', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [
      folder,
      testFile('marketing', 'hero.png'),
      testFolder('marketing', 'q1'),
      testFile('marketing/q1', 'banner.png'),
    ];

    expect(await countFolderContents(folder)).toEqual({
      files: 2,
      folders: 1,
      total: 3,
    });
  });

  it('returns zeroes for an empty folder', async () => {
    const folder = testFolder('', 'marketing');
    assetDocs = [folder];

    expect(await countFolderContents(folder)).toEqual({
      files: 0,
      folders: 0,
      total: 0,
    });
  });
});
