import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  Asset,
  AssetFolder,
  createAssetFolder,
  findPreserveFilenameFolder,
  getFolderId,
  getFolderUploadOptions,
  resolveFolderUploadOptions,
  updateFolderPreserveFilename,
} from './assets.js';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {now: () => ({type: 'timestamp'})},
  collection: mocks.collection,
  deleteDoc: vi.fn(),
  deleteField: mocks.deleteField,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({type: 'serverTimestamp'})),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('./actions.js', () => ({logAction: vi.fn()}));
vi.mock('./doc-cache.js', () => ({removeDocsFromCache: vi.fn()}));

/** The asset docs the mocked firestore reads from, keyed by doc id. */
let assetDocs: Map<string, Asset> = new Map();

function testFolder(
  folderPath: string,
  extra: Partial<AssetFolder> = {}
): AssetFolder {
  const segments = folderPath.split('/');
  return {
    id: getFolderId(folderPath),
    type: 'folder',
    parent: segments.slice(0, -1).join('/'),
    name: segments.at(-1)!,
    ...extra,
  } as AssetFolder;
}

function addFolders(...folders: AssetFolder[]) {
  folders.forEach((folder) => assetDocs.set(folder.id, folder));
}

/** Wires the firestore mocks up to the in-memory `assetDocs`. */
function setupFirestoreMocks() {
  vi.clearAllMocks();
  assetDocs = new Map();
  window.__ROOT_CTX = {rootConfig: {projectId: 'test-project'}} as any;
  window.firebase = {
    db: {type: 'mock-db'},
    user: {email: 'editor@example.com'},
  } as any;
  mocks.collection.mockImplementation(
    (_db: unknown, ...path: string[]) => `col:${path.join('/')}`
  );
  mocks.doc.mockImplementation((_col: unknown, id: string) => ({id: id}));
  mocks.getDoc.mockImplementation(async (ref: {id: string}) => {
    const asset = assetDocs.get(ref.id);
    return {
      exists: () => !!asset,
      data: () => asset,
    };
  });
  mocks.deleteField.mockImplementation(() => ({type: 'deleteField'}));
  mocks.setDoc.mockImplementation(async (ref: {id: string}, data: any) => {
    assetDocs.set(ref.id, {...(assetDocs.get(ref.id) || {}), ...data});
  });
  mocks.updateDoc.mockImplementation(async (ref: {id: string}, data: any) => {
    const existing: any = {...(assetDocs.get(ref.id) || {})};
    Object.entries(data).forEach(([key, value]: [string, any]) => {
      if (value?.type === 'deleteField') {
        delete existing[key];
      } else {
        existing[key] = value;
      }
    });
    assetDocs.set(ref.id, existing);
  });
}

describe('getFolderUploadOptions', () => {
  it('uses the hash-path naming mode when preserving filenames', () => {
    expect(getFolderUploadOptions(true)).toEqual({namingMode: 'hash-path'});
  });

  it('uses the default naming otherwise', () => {
    expect(getFolderUploadOptions(false)).toEqual({});
  });
});

describe('findPreserveFilenameFolder', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('returns null for the root folder without any reads', async () => {
    expect(await findPreserveFilenameFolder('')).toBeNull();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it('returns the folder itself when it enables the setting', async () => {
    addFolders(
      testFolder('marketing'),
      testFolder('marketing/q1', {preserveFilename: true})
    );
    expect(await findPreserveFilenameFolder('marketing/q1')).toEqual(
      'marketing/q1'
    );
  });

  it('inherits the setting from the nearest ancestor', async () => {
    addFolders(
      testFolder('docs', {preserveFilename: true}),
      testFolder('docs/reports'),
      testFolder('docs/reports/2026')
    );
    expect(await findPreserveFilenameFolder('docs/reports/2026')).toEqual(
      'docs'
    );
    expect(await findPreserveFilenameFolder('docs/reports')).toEqual('docs');
  });

  it('prefers the nearest folder when several enable the setting', async () => {
    addFolders(
      testFolder('docs', {preserveFilename: true}),
      testFolder('docs/reports', {preserveFilename: true})
    );
    expect(await findPreserveFilenameFolder('docs/reports')).toEqual(
      'docs/reports'
    );
  });

  it('returns null when no folder in the chain enables it', async () => {
    addFolders(
      testFolder('marketing'),
      testFolder('marketing/q1', {preserveFilename: false})
    );
    expect(await findPreserveFilenameFolder('marketing/q1')).toBeNull();
  });

  it('tolerates missing folder docs', async () => {
    addFolders(testFolder('docs', {preserveFilename: true}));
    // `docs/missing` has no db doc (e.g. an implicit folder).
    expect(await findPreserveFilenameFolder('docs/missing')).toEqual('docs');
    expect(await findPreserveFilenameFolder('nothing/here')).toBeNull();
  });

  it('reads every folder in the chain in parallel', async () => {
    addFolders(testFolder('a'), testFolder('a/b'), testFolder('a/b/c'));
    await findPreserveFilenameFolder('a/b/c');
    const ids = mocks.getDoc.mock.calls.map((call: any) => call[0].id);
    expect(ids).toEqual([
      getFolderId('a'),
      getFolderId('a/b'),
      getFolderId('a/b/c'),
    ]);
  });
});

describe('resolveFolderUploadOptions', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('maps an inherited setting to the hash-path naming mode', async () => {
    addFolders(testFolder('docs', {preserveFilename: true}));
    expect(await resolveFolderUploadOptions('docs/reports')).toEqual({
      namingMode: 'hash-path',
    });
    expect(await resolveFolderUploadOptions('images')).toEqual({});
  });
});

describe('folder preserveFilename writes', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('createAssetFolder stores the flag only when enabled', async () => {
    const plain = await createAssetFolder('', 'images');
    expect('preserveFilename' in plain).toBe(false);

    const preserving = await createAssetFolder('', 'docs', {
      preserveFilename: true,
    });
    expect(preserving.preserveFilename).toBe(true);
    expect(preserving.parent).toEqual('');
    expect(preserving.name).toEqual('docs');
  });

  it('createAssetFolder keeps the flag on an existing folder', async () => {
    addFolders(testFolder('docs', {preserveFilename: true}));
    const folder = await createAssetFolder('', 'docs');
    expect(folder.preserveFilename).toBe(true);
  });

  it('updateFolderPreserveFilename toggles the flag', async () => {
    addFolders(testFolder('docs'));
    const folder = assetDocs.get(getFolderId('docs')) as AssetFolder;

    const enabled = await updateFolderPreserveFilename(folder, true);
    expect(enabled.preserveFilename).toBe(true);
    expect(enabled.modifiedBy).toEqual('editor@example.com');

    const disabled = await updateFolderPreserveFilename(enabled, false);
    expect('preserveFilename' in disabled).toBe(false);
    expect(mocks.deleteField).toHaveBeenCalled();
  });
});
