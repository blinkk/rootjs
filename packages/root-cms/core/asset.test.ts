import {RootConfig} from '@blinkk/root';
import {describe, it, expect, beforeEach, vi} from 'vitest';

// In-memory Firestore mock. Models the subset of the firebase-admin Firestore
// API used by the asset-library methods on RootCMSClient: doc(), collection()
// (+ where/get/count), getAll(), batch(), and collectionGroup().
const store = new Map<string, any>();

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function getAtDotted(obj: any, path: string): any {
  let cur = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function resolveValue(v: any): any {
  if (v && typeof v === 'object' && v.__op === 'serverTimestamp') {
    return 1700000000000;
  }
  return v;
}

function setAtDotted(obj: any, path: string, value: any) {
  const segs = path.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur[segs[i]] === null || typeof cur[segs[i]] !== 'object') {
      cur[segs[i]] = {};
    }
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = resolveValue(value);
}

function makeRef(path: string): any {
  return {
    path,
    get id() {
      return path.split('/').pop();
    },
    async get() {
      const data = store.get(path);
      return {
        exists: data !== undefined,
        data: () => clone(data),
        ref: makeRef(path),
      };
    },
    async set(data: any) {
      store.set(path, clone(data));
    },
    async update(updates: Record<string, any>) {
      const data = store.get(path) || {};
      for (const [k, v] of Object.entries(updates)) {
        setAtDotted(data, k, v);
      }
      store.set(path, data);
    },
    async delete() {
      store.delete(path);
    },
  };
}

function makeQuery(
  path: string,
  filters: Array<{field: string; val: any}> = []
): any {
  return {
    where(field: string, _op: string, val: any) {
      return makeQuery(path, [...filters, {field, val}]);
    },
    async get() {
      const docs: any[] = [];
      for (const [k, data] of store) {
        if (!k.startsWith(`${path}/`)) continue;
        const rest = k.slice(path.length + 1);
        if (rest.includes('/')) continue;
        if (filters.every((f) => getAtDotted(data, f.field) === f.val)) {
          docs.push({id: rest, ref: makeRef(k), data: () => clone(data)});
        }
      }
      return {docs, empty: docs.length === 0, size: docs.length};
    },
    count() {
      return {
        get: async () => {
          const snap = await makeQuery(path, filters).get();
          return {data: () => ({count: snap.size})};
        },
      };
    },
  };
}

function makeBatch(): any {
  const ops: Array<[string, string, any?]> = [];
  return {
    set(ref: any, data: any) {
      ops.push(['set', ref.path, clone(data)]);
    },
    update(ref: any, updates: any) {
      ops.push(['update', ref.path, updates]);
    },
    delete(ref: any) {
      ops.push(['delete', ref.path]);
    },
    async commit() {
      for (const [op, p, data] of ops) {
        if (op === 'set') {
          store.set(p, clone(data));
        } else if (op === 'update') {
          const cur = store.get(p) || {};
          for (const [k, v] of Object.entries(data)) {
            setAtDotted(cur, k, v);
          }
          store.set(p, cur);
        } else if (op === 'delete') {
          store.delete(p);
        }
      }
      ops.length = 0;
    },
  };
}

const mockDb: any = {
  doc: (path: string) => makeRef(path),
  collection: (path: string) => makeQuery(path),
  getAll: (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
  batch: () => makeBatch(),
  collectionGroup: (name: string) => ({
    async get() {
      const docs: any[] = [];
      for (const [k, data] of store) {
        const segs = k.split('/');
        if (segs.length >= 2 && segs[segs.length - 2] === name) {
          docs.push({ref: makeRef(k), data: () => clone(data)});
        }
      }
      return {docs};
    },
  }),
};

vi.mock('firebase-admin/app', () => ({
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
  Timestamp: {now: vi.fn(() => ({toMillis: () => 1700000000000}))},
  FieldValue: {serverTimestamp: () => ({__op: 'serverTimestamp'})},
  DocumentReference: class {},
  Firestore: class {},
  Query: class {},
  WriteBatch: class {},
}));

vi.mock('./project.js', () => ({getCollectionSchema: vi.fn()}));

const PROJECT = 'test-project';
const mockRootConfig = {
  rootDir: '/test',
  plugins: [
    {
      name: 'root-cms',
      getConfig: () => ({id: PROJECT}),
      getFirebaseApp: vi.fn(),
      getFirestore: vi.fn(() => mockDb),
    } as any,
  ],
} as unknown as RootConfig;

function draftPath(collection: string, slug: string) {
  return `Projects/${PROJECT}/Collections/${collection}/Drafts/${slug}`;
}

async function newClient() {
  const {RootCMSClient} = await import('./client.js');
  return new RootCMSClient(mockRootConfig);
}

describe('RootCMSClient asset library', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('createAsset writes a v1 asset doc with a folder', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1', width: 100, height: 50, filename: 'logo.png'},
      {createdBy: 'a@b.com', dir: '/logos'}
    );
    expect(asset.version).toBe(1);
    expect(asset.dir).toBe('/logos');
    const stored = store.get(`Projects/${PROJECT}/Assets/${asset.id}`);
    expect(stored.src).toBe('https://img/v1');
    expect(stored.sys.createdBy).toBe('a@b.com');
  });

  it('syncUsagesForDoc records reverse + forward index entries', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1'},
      {createdBy: 'a@b.com'}
    );
    // A draft that references the asset in a nested array item.
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {
        modules: {
          _array: ['k1'],
          k1: {
            image: {src: 'https://img/v1', assetId: asset.id, assetVersion: 1},
          },
        },
      },
    });

    await client.syncUsagesForDoc('Pages/home');

    const usage = store.get(
      `Projects/${PROJECT}/Assets/${asset.id}/Usages/Pages--home`
    );
    expect(usage).toMatchObject({
      docId: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
    });
    const forward = store.get(
      `Projects/${PROJECT}/AssetUsagesByDoc/Pages--home`
    );
    expect(forward.assetIds).toEqual([asset.id]);

    // Count reflects the single usage.
    expect(await client.getAssetUsageCount(asset.id)).toBe(1);
  });

  it('replaceAsset fans the new file out to referencing drafts (bumps version)', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1', width: 100, height: 50},
      {createdBy: 'a@b.com'}
    );
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {
        hero: {src: 'https://img/v1', assetId: asset.id, assetVersion: 1},
        body: {
          // richtext: must NOT be touched.
          time: 1,
          version: '2.0',
          blocks: [{type: 'p', data: {text: 'hi'}}],
        },
      },
    });
    await client.syncUsagesForDoc('Pages/home');

    const result = await client.replaceAsset(
      asset.id,
      {src: 'https://img/v2', width: 200, height: 80},
      {replacedBy: 'editor@b.com'}
    );

    expect(result.docsUpdated).toBe(1);
    expect(result.asset.version).toBe(2);
    const draft = store.get(draftPath('Pages', 'home'));
    expect(draft.fields.hero.src).toBe('https://img/v2');
    expect(draft.fields.hero.width).toBe(200);
    expect(draft.fields.hero.assetVersion).toBe(2);
    expect(draft.fields.hero.assetId).toBe(asset.id);
    // sys bumped by the fan-out.
    expect(draft.sys.modifiedBy).toBe('editor@b.com');
    // richtext untouched.
    expect(draft.fields.body.blocks).toEqual([{type: 'p', data: {text: 'hi'}}]);
  });

  it('replaceAsset does not touch independent (non-library) uploads', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1'},
      {createdBy: 'a@b.com'}
    );
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {
        hero: {src: 'https://img/v1', assetId: asset.id},
        other: {src: 'https://independent/x'},
      },
    });
    await client.syncUsagesForDoc('Pages/home');
    await client.replaceAsset(
      asset.id,
      {src: 'https://img/v2'},
      {replacedBy: 'e@b.com'}
    );

    const draft = store.get(draftPath('Pages', 'home'));
    expect(draft.fields.hero.src).toBe('https://img/v2');
    expect(draft.fields.other.src).toBe('https://independent/x');
  });

  it('deleteAsset is blocked while in use, allowed with force', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1'},
      {createdBy: 'a@b.com'}
    );
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {hero: {src: 'https://img/v1', assetId: asset.id}},
    });
    await client.syncUsagesForDoc('Pages/home');

    await expect(client.deleteAsset(asset.id)).rejects.toThrow(/in use/);

    await client.deleteAsset(asset.id, {force: true});
    expect(store.get(`Projects/${PROJECT}/Assets/${asset.id}`)).toBeUndefined();
  });

  it('syncUsagesForDoc removes usages when the asset is detached', async () => {
    const client = await newClient();
    const asset = await client.createAsset(
      {src: 'https://img/v1'},
      {createdBy: 'a@b.com'}
    );
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {hero: {src: 'https://img/v1', assetId: asset.id}},
    });
    await client.syncUsagesForDoc('Pages/home');
    expect(await client.getAssetUsageCount(asset.id)).toBe(1);

    // Editor detaches: inline value no longer carries an assetId.
    store.set(draftPath('Pages', 'home'), {
      id: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      fields: {hero: {src: 'https://img/v1'}},
    });
    await client.syncUsagesForDoc('Pages/home');
    expect(await client.getAssetUsageCount(asset.id)).toBe(0);
    expect(
      store.get(`Projects/${PROJECT}/AssetUsagesByDoc/Pages--home`)
    ).toBeUndefined();
  });
});
