import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  Asset,
  AssetFolder,
  FolderNotEmptyError,
  countFolderContents,
  deleteAsset,
  getFileGcsPath,
} from './assets.js';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  deleteFileFromGCS: vi.fn(),
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

vi.mock('../../integrations/gcs.js', () => ({
  deleteFileFromGCS: mocks.deleteFileFromGCS,
}));

vi.mock('../logs/actions.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('../documents/doc-cache.js', () => ({
  removeDocsFromCache: mocks.removeDocsFromCache,
}));

/** The asset docs the mocked firestore queries read from. */
let assetDocs: Asset[] = [];
/** Ids passed to `deleteDoc()`. */
let deletedIds: string[] = [];
/** GCS paths passed to `deleteFileFromGCS()`. */
let deletedFiles: string[] = [];
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

function testFile(parent: string, name: string, src?: string): Asset {
  return {
    id: `file-${parent}-${name}`,
    type: 'file',
    parent: parent,
    name: name,
    file: {
      src: src || `https://storage.googleapis.com/bucket/uploads/${name}`,
    },
  } as Asset;
}

/** Applies a mocked `where()` constraint to an in-memory asset doc. */
function testConstraint(asset: any, constraint: any): boolean {
  const value = String(constraint.field)
    .split('.')
    .reduce((obj, key) => obj?.[key], asset);
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
  deletedFiles = [];
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
  mocks.deleteFileFromGCS.mockImplementation(async (gcsPath: string) => {
    deletedFiles.push(gcsPath);
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
        path: 'marketing',
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

describe('deleteAsset with deleteFiles', () => {
  beforeEach(() => {
    setupFirestoreMocks();
    // Deleted asset docs drop out of the in-memory db.
    mocks.deleteDoc.mockImplementation(async (ref: any) => {
      deletedIds.push(ref.id);
      assetDocs = assetDocs.filter((asset) => asset.id !== ref.id);
    });
  });

  it('leaves GCS files alone by default', async () => {
    const file = testFile('', 'hero.png');
    assetDocs = [file];

    const result = await deleteAsset(file);

    expect(mocks.deleteFileFromGCS).not.toHaveBeenCalled();
    expect(result.deletedFiles).toEqual([]);
  });

  it('deletes the file from GCS after deleting the asset doc', async () => {
    const file = testFile('', 'hero.png');
    assetDocs = [file];
    const order: string[] = [];
    mocks.deleteDoc.mockImplementationOnce(async () => {
      order.push('doc');
    });
    mocks.deleteFileFromGCS.mockImplementationOnce(async () => {
      order.push('gcs');
    });

    const result = await deleteAsset(file, {deleteFiles: true});

    expect(order).toEqual(['doc', 'gcs']);
    expect(mocks.deleteFileFromGCS).toHaveBeenCalledWith(
      'https://storage.googleapis.com/bucket/uploads/hero.png'
    );
    expect(result.deletedFiles).toEqual([
      'https://storage.googleapis.com/bucket/uploads/hero.png',
    ]);
    expect(mocks.logAction).toHaveBeenCalledWith('asset.delete', {
      metadata: expect.objectContaining({
        deleteFiles: true,
        numFilesDeleted: 1,
      }),
    });
  });

  it('prefers the gcsPath of images served through GCI', async () => {
    const file = testFile(
      '',
      'hero.png',
      'https://lh3.googleusercontent.com/abc'
    );
    (file as any).file.gcsPath = '/bucket/uploads/hero.png';
    assetDocs = [file];

    await deleteAsset(file, {deleteFiles: true});

    expect(deletedFiles).toEqual(['/bucket/uploads/hero.png']);
  });

  it('keeps files that other assets still use', async () => {
    const src = 'https://storage.googleapis.com/bucket/uploads/shared.png';
    const file = testFile('a', 'hero.png', src);
    assetDocs = [file, testFile('b', 'copy.png', src)];

    const result = await deleteAsset(file, {deleteFiles: true});

    expect(deletedIds).toEqual([file.id]);
    expect(mocks.deleteFileFromGCS).not.toHaveBeenCalled();
    expect(result.keptFiles).toEqual([src]);
  });

  it('deletes nested files of a folder, once per shared file', async () => {
    const shared = 'https://storage.googleapis.com/bucket/uploads/shared.png';
    const folder = testFolder('', 'marketing');
    assetDocs = [
      folder,
      testFile('marketing', 'hero.png'),
      testFile('marketing', 'a.png', shared),
      testFolder('marketing', 'q1'),
      testFile('marketing/q1', 'b.png', shared),
    ];
    // Recursive deletes go through write batches; mirror them in the db.
    mocks.writeBatch.mockImplementation(() => {
      const ops: string[] = [];
      return {
        delete: (ref: any) => ops.push(ref.id),
        commit: async () => {
          deletedIds.push(...ops);
          assetDocs = assetDocs.filter((asset) => !ops.includes(asset.id));
        },
      };
    });

    const result = await deleteAsset(folder, {
      recursive: true,
      deleteFiles: true,
    });

    expect(deletedFiles.sort()).toEqual(
      ['https://storage.googleapis.com/bucket/uploads/hero.png', shared].sort()
    );
    expect(result.keptFiles).toEqual([]);
    expect(result.failedFiles).toEqual([]);
  });

  it('treats files already missing from GCS as deleted', async () => {
    const file = testFile('', 'hero.png');
    assetDocs = [file];
    mocks.deleteFileFromGCS.mockRejectedValueOnce(
      Object.assign(new Error('not found'), {code: 'storage/object-not-found'})
    );

    const result = await deleteAsset(file, {deleteFiles: true});

    expect(result.deletedFiles).toHaveLength(1);
    expect(result.failedFiles).toEqual([]);
  });

  it('reports files that fail to delete without failing the delete', async () => {
    const file = testFile('', 'hero.png');
    assetDocs = [file];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.deleteFileFromGCS.mockRejectedValueOnce(
      Object.assign(new Error('denied'), {code: 'storage/unauthorized'})
    );

    const result = await deleteAsset(file, {deleteFiles: true});

    expect(deletedIds).toEqual([file.id]);
    expect(result.failedFiles).toEqual([
      'https://storage.googleapis.com/bucket/uploads/hero.png',
    ]);
  });

  it('reports files that are not stored in GCS', async () => {
    const file = testFile('', 'hero.png', 'https://example.com/hero.png');
    assetDocs = [file];

    const result = await deleteAsset(file, {deleteFiles: true});

    expect(mocks.deleteFileFromGCS).not.toHaveBeenCalled();
    expect(result.failedFiles).toEqual(['https://example.com/hero.png']);
  });
});

describe('getFileGcsPath', () => {
  it('resolves the GCS location of an uploaded file', () => {
    expect(
      getFileGcsPath({
        src: 'https://lh3.googleusercontent.com/abc',
        gcsPath: '/bucket/a.png',
      })
    ).toBe('/bucket/a.png');
    expect(
      getFileGcsPath({src: 'https://storage.googleapis.com/bucket/a.pdf'})
    ).toBe('https://storage.googleapis.com/bucket/a.pdf');
    expect(getFileGcsPath({src: 'https://example.com/a.pdf'})).toBe(null);
    expect(getFileGcsPath(null)).toBe(null);
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
