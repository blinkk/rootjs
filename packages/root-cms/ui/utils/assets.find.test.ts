import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Asset, findAssetFile} from './assets.js';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {now: () => ({type: 'timestamp'})},
  collection: mocks.collection,
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: mocks.getDocs,
  limit: vi.fn(),
  query: mocks.query,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: mocks.where,
  writeBatch: vi.fn(),
}));

vi.mock('./actions.js', () => ({logAction: vi.fn()}));
vi.mock('./doc-cache.js', () => ({removeDocsFromCache: vi.fn()}));

/** The asset docs the mocked firestore queries read from. */
let assetDocs: Asset[] = [];

function testAsset(type: 'file' | 'folder', parent: string, name: string) {
  return {
    id: `${type}-${parent}-${name}`,
    type: type,
    parent: parent,
    name: name,
  } as Asset;
}

/** Wires the firestore mocks up to the in-memory `assetDocs`. */
function setupFirestoreMocks() {
  vi.clearAllMocks();
  assetDocs = [];
  window.__ROOT_CTX = {rootConfig: {projectId: 'test-project'}} as any;
  window.firebase = {
    db: {type: 'mock-db'},
    user: {email: 'editor@example.com'},
  } as any;
  mocks.collection.mockImplementation(
    (_db: unknown, ...path: string[]) => `col:${path.join('/')}`
  );
  mocks.where.mockImplementation((field: string, op: string, value: any) => ({
    field: field,
    op: op,
    value: value,
  }));
  mocks.query.mockImplementation((_colRef: unknown, ...constraints: any[]) => ({
    constraints: constraints,
  }));
  mocks.getDocs.mockImplementation(async (q: any) => {
    const matches = assetDocs.filter((asset: any) =>
      (q.constraints || []).every(
        (c: any) => c.op === '==' && asset[c.field] === c.value
      )
    );
    return {
      forEach: (cb: (snap: any) => void) =>
        matches.forEach((asset) => cb({data: () => asset})),
    };
  });
}

describe('findAssetFile', () => {
  beforeEach(() => {
    setupFirestoreMocks();
  });

  it('finds a file by name within a folder', async () => {
    assetDocs = [
      testAsset('file', 'marketing', 'hero.png'),
      testAsset('file', 'marketing', 'logo.png'),
    ];

    const res = await findAssetFile('marketing', 'hero.png');

    expect(res?.id).toEqual('file-marketing-hero.png');
  });

  it('returns null when no file has that name', async () => {
    assetDocs = [testAsset('file', 'marketing', 'hero.png')];

    expect(await findAssetFile('marketing', 'banner.png')).toBeNull();
    expect(await findAssetFile('marketing', 'HERO.png')).toBeNull();
  });

  it('ignores same-named files in other folders', async () => {
    assetDocs = [
      testAsset('file', '', 'hero.png'),
      testAsset('file', 'marketing/q1', 'hero.png'),
    ];

    expect(await findAssetFile('marketing', 'hero.png')).toBeNull();
    expect((await findAssetFile('', 'hero.png'))?.parent).toEqual('');
  });

  it('ignores folders with the same name', async () => {
    assetDocs = [testAsset('folder', 'marketing', 'hero.png')];

    expect(await findAssetFile('marketing', 'hero.png')).toBeNull();
  });

  it('normalizes a trailing slash on the parent path', async () => {
    assetDocs = [testAsset('file', 'marketing', 'hero.png')];

    const res = await findAssetFile('marketing/', 'hero.png');

    expect(res?.id).toEqual('file-marketing-hero.png');
  });
});
