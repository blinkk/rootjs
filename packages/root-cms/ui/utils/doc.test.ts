import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  cmsAssignSortKeys,
  cmsCopyDoc,
  cmsCreateDoc,
  cmsPublishDocs,
  cmsSetDocSortKey,
  getDraftDocs,
} from './doc.js';

const mocks = vi.hoisted(() => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  removeDocFromCache: vi.fn(),
  removeDocsFromCache: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: mocks.arrayUnion,
  collection: mocks.collection,
  deleteField: mocks.deleteField,
  doc: mocks.doc,
  documentId: mocks.documentId,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  limit: mocks.limit,
  orderBy: mocks.orderBy,
  query: mocks.query,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  startAfter: mocks.startAfter,
  updateDoc: mocks.updateDoc,
  where: mocks.where,
  writeBatch: mocks.writeBatch,
}));

vi.mock('./actions.js', () => ({
  logAction: mocks.logAction,
}));

vi.mock('./doc-cache.js', () => ({
  removeDocFromCache: mocks.removeDocFromCache,
  removeDocsFromCache: mocks.removeDocsFromCache,
}));

vi.mock('./l10n.js', () => ({
  getTranslationsCollection: vi.fn(),
  normalizeString: (str: string) => str.trim(),
  sourceHash: vi.fn(),
}));

const mockDb = {type: 'mock-db'};

describe('cmsCopyDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__ROOT_CTX = {
      rootConfig: {
        projectId: 'test-project',
      },
    } as any;
    window.firebase = {
      db: mockDb,
      user: {email: 'editor@example.com'},
    } as any;
    mocks.doc.mockImplementation(
      (_db: unknown, ...path: string[]) => `doc:${path.join('/')}`
    );
    mocks.serverTimestamp.mockReturnValue({type: 'serverTimestamp'});
  });

  it('copies the source doc locales configuration', async () => {
    mocks.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          fields: {title: 'Hello'},
          sys: {locales: ['en', 'es', 'fr']},
        }),
      })
      .mockResolvedValueOnce({
        exists: () => false,
      });

    await cmsCopyDoc('pages/source', 'pages/copy');

    expect(mocks.setDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/copy',
      expect.objectContaining({
        fields: {title: 'Hello'},
        sys: expect.objectContaining({
          locales: ['en', 'es', 'fr'],
        }),
      })
    );
  });

  it('uses the source doc locales configuration when overwriting', async () => {
    mocks.getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          fields: {title: 'Hello'},
          sys: {locales: ['en', 'de']},
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          sys: {
            createdAt: 'old-created-at',
            createdBy: 'previous@example.com',
            locales: ['en'],
          },
        }),
      });

    await cmsCopyDoc('pages/source', 'pages/copy', {overwrite: true});

    expect(mocks.setDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/copy',
      expect.objectContaining({
        fields: {title: 'Hello'},
        sys: expect.objectContaining({
          createdAt: 'old-created-at',
          createdBy: 'previous@example.com',
          locales: ['en', 'de'],
        }),
      })
    );
  });
});

function setupWindowMocks(collections?: Record<string, any>) {
  window.__ROOT_CTX = {
    rootConfig: {
      projectId: 'test-project',
    },
    collections,
  } as any;
  window.firebase = {
    db: mockDb,
    user: {email: 'editor@example.com'},
  } as any;
  mocks.doc.mockImplementation(
    (_db: unknown, ...path: string[]) => `doc:${path.join('/')}`
  );
  mocks.serverTimestamp.mockReturnValue({type: 'serverTimestamp'});
}

describe('cmsSetDocSortKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks();
  });

  it('updates the draft doc sort key and bumps modifiedAt', async () => {
    await cmsSetDocSortKey('pages/foo', 'a5');

    // Only the draft doc is written; the published doc keeps its existing
    // order until the doc is published again.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/foo',
      {
        'sys.sortKey': 'a5',
        'sys.modifiedAt': {type: 'serverTimestamp'},
        'sys.modifiedBy': 'editor@example.com',
      }
    );
    expect(mocks.logAction).toHaveBeenCalledWith('doc.reorder', {
      metadata: {docId: 'pages/foo', sortKey: 'a5'},
    });
  });

  it('propagates write errors', async () => {
    mocks.updateDoc.mockRejectedValueOnce({code: 'permission-denied'});

    await expect(cmsSetDocSortKey('pages/foo', 'a5')).rejects.toEqual({
      code: 'permission-denied',
    });
    expect(mocks.logAction).not.toHaveBeenCalled();
  });
});

describe('cmsAssignSortKeys', () => {
  let batches: Array<{update: any; commit: any}>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks();
    batches = [];
    mocks.writeBatch.mockImplementation(() => {
      const batch = {
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      batches.push(batch);
      return batch;
    });
  });

  it('updates draft docs in a batch, bumping modifiedAt', async () => {
    await cmsAssignSortKeys([
      {docId: 'pages/a', sortKey: 'a1'},
      {docId: 'pages/b', sortKey: 'a2'},
    ]);

    expect(batches.length).toBe(1);
    expect(batches[0].update).toHaveBeenCalledTimes(2);
    expect(batches[0].update).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/a',
      {
        'sys.sortKey': 'a1',
        'sys.modifiedAt': {type: 'serverTimestamp'},
        'sys.modifiedBy': 'editor@example.com',
      }
    );
    expect(batches[0].update).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/b',
      {
        'sys.sortKey': 'a2',
        'sys.modifiedAt': {type: 'serverTimestamp'},
        'sys.modifiedBy': 'editor@example.com',
      }
    );
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    // Only drafts are written; published docs keep their existing order
    // until the docs are published again.
    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalledWith('doc.assign_sort_keys', {
      metadata: {collectionId: 'pages', count: 2},
    });
  });

  it('chunks draft updates into batches of 500 writes', async () => {
    const entries = Array.from({length: 501}, (_, i) => ({
      docId: `pages/doc-${i}`,
      sortKey: `key-${i}`,
    }));

    await cmsAssignSortKeys(entries);

    expect(batches.length).toBe(2);
    expect(batches[0].update).toHaveBeenCalledTimes(500);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(batches[1].update).toHaveBeenCalledTimes(1);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty list', async () => {
    await cmsAssignSortKeys([]);
    expect(mocks.writeBatch).not.toHaveBeenCalled();
    expect(mocks.logAction).not.toHaveBeenCalled();
  });
});

describe('cmsCreateDoc custom sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks({pages: {customSorting: true}});
  });

  it('assigns a sort key at the end of the custom order', async () => {
    mocks.getDoc.mockResolvedValueOnce({exists: () => false});
    // Max sort key query returns the current largest key.
    mocks.getDocs.mockResolvedValueOnce({
      docs: [{data: () => ({sys: {sortKey: 'a5'}})}],
    });

    await cmsCreateDoc('pages/new-doc');

    expect(mocks.setDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/new-doc',
      expect.objectContaining({
        sys: expect.objectContaining({sortKey: 'a6'}),
      })
    );
  });

  it('assigns the initial key when no docs have keys', async () => {
    mocks.getDoc.mockResolvedValueOnce({exists: () => false});
    mocks.getDocs.mockResolvedValueOnce({docs: []});

    await cmsCreateDoc('pages/new-doc');

    const savedData = mocks.setDoc.mock.calls[0][1];
    expect(savedData.sys.sortKey).toBe('a0');
  });

  it('does not assign a sort key when customSorting is disabled', async () => {
    setupWindowMocks({pages: {}});
    mocks.getDoc.mockResolvedValueOnce({exists: () => false});

    await cmsCreateDoc('pages/new-doc');

    expect(mocks.getDocs).not.toHaveBeenCalled();
    const savedData = mocks.setDoc.mock.calls[0][1];
    expect(savedData.sys.sortKey).toBeUndefined();
  });

  it('preserves the sort key when overwriting a keyed doc', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        sys: {
          createdAt: 'old-created-at',
          createdBy: 'previous@example.com',
          locales: ['en'],
          sortKey: 'a3',
        },
      }),
    });

    await cmsCreateDoc('pages/existing', {overwrite: true});

    expect(mocks.getDocs).not.toHaveBeenCalled();
    const savedData = mocks.setDoc.mock.calls[0][1];
    expect(savedData.sys.sortKey).toBe('a3');
  });

  it('still creates the doc when the max sort key query fails', async () => {
    mocks.getDoc.mockResolvedValueOnce({exists: () => false});
    mocks.getDocs.mockRejectedValueOnce(new Error('firestore unavailable'));

    await cmsCreateDoc('pages/new-doc');

    expect(mocks.setDoc).toHaveBeenCalled();
    const savedData = mocks.setDoc.mock.calls[0][1];
    expect(savedData.sys.sortKey).toBeUndefined();
  });
});

/**
 * Fake db of draft docs, keyed by the "Drafts" collection path, then by slug,
 * e.g. `fakeDrafts['Projects/test-project/Collections/pages/Drafts']['foo']`.
 */
let fakeDrafts: Record<string, Record<string, any>>;

function addFakeDrafts(collectionId: string, slugs: string[]) {
  const path = `Projects/test-project/Collections/${collectionId}/Drafts`;
  const collectionDrafts = (fakeDrafts[path] ??= {});
  slugs.forEach((slug) => {
    collectionDrafts[slug] = {
      id: `${collectionId}/${slug}`,
      collection: collectionId,
      slug: slug,
      sys: {},
      fields: {title: `title for ${slug}`},
    };
  });
}

function setupDraftQueryMocks() {
  fakeDrafts = {};
  mocks.collection.mockImplementation((_db: unknown, ...path: string[]) => ({
    path: path.join('/'),
  }));
  // documentId() is just a sentinel field path. query()/where() pass the
  // requested chunk straight through so the fake db (getDocs) can resolve it.
  mocks.documentId.mockReturnValue('__name__');
  mocks.where.mockImplementation((_field: any, _op: any, chunk: string[]) => ({
    chunk,
  }));
  mocks.query.mockImplementation((colRef: any, whereClause: any) => ({
    colRef,
    chunk: whereClause.chunk,
  }));
  // Resolve a query by returning only the docs whose slug is in the chunk,
  // mirroring firestore's `where(documentId(), 'in', chunk)` semantics.
  mocks.getDocs.mockImplementation(
    (q: {colRef: {path: string}; chunk: string[]}) => {
      const collectionDrafts = fakeDrafts[q.colRef.path] || {};
      const matched = q.chunk
        .filter((slug) => collectionDrafts[slug] !== undefined)
        .map((slug) => ({id: slug, data: () => collectionDrafts[slug]}));
      return {
        forEach: (cb: (doc: {id: string; data: () => any}) => void) =>
          matched.forEach(cb),
      };
    }
  );
}

describe('getDraftDocs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks();
    setupDraftQueryMocks();
  });

  it('fetches draft docs across collections', async () => {
    addFakeDrafts('pages', ['foo', 'bar']);
    addFakeDrafts('blog', ['baz']);

    const drafts = await getDraftDocs(['pages/foo', 'pages/bar', 'blog/baz']);

    expect(Object.keys(drafts).sort()).toEqual([
      'blog/baz',
      'pages/bar',
      'pages/foo',
    ]);
    expect((drafts['pages/foo'] as any).fields).toEqual({
      title: 'title for foo',
    });
    // One query per collection (both under the 30-slug chunk limit).
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('chunks `in` queries into batches of 30 per collection', async () => {
    const pageSlugs = Array.from({length: 65}, (_, i) => `page-${i}`);
    const blogSlugs = Array.from({length: 5}, (_, i) => `post-${i}`);
    addFakeDrafts('pages', pageSlugs);
    addFakeDrafts('blog', blogSlugs);
    const docIds = [
      ...pageSlugs.map((slug) => `pages/${slug}`),
      ...blogSlugs.map((slug) => `blog/${slug}`),
    ];

    const drafts = await getDraftDocs(docIds);

    // 65 page slugs chunked by 30 => 3 queries (30 + 30 + 5), plus 1 query
    // for the 5 blog slugs.
    expect(mocks.getDocs).toHaveBeenCalledTimes(4);
    mocks.getDocs.mock.calls.forEach(([q]) => {
      expect(q.chunk.length).toBeLessThanOrEqual(30);
    });
    expect(Object.keys(drafts)).toHaveLength(70);
  });
});

describe('cmsPublishDocs', () => {
  let batches: Array<{
    set: any;
    update: any;
    delete: any;
    commit: any;
    numWrites: () => number;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks();
    setupDraftQueryMocks();
    batches = [];
    mocks.writeBatch.mockImplementation(() => {
      const batch = {
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
        numWrites: () =>
          batch.set.mock.calls.length +
          batch.update.mock.calls.length +
          batch.delete.mock.calls.length,
      };
      batches.push(batch);
      return batch;
    });
  });

  it('publishes more than 100 docs (issue #457)', async () => {
    const slugs = Array.from({length: 120}, (_, i) => `page-${i}`);
    addFakeDrafts('pages', slugs);
    const docIds = slugs.map((slug) => `pages/${slug}`);

    await cmsPublishDocs(docIds);

    // Draft docs are fetched with `in` queries chunked at 30 slugs.
    expect(mocks.getDocs).toHaveBeenCalledTimes(4);
    // Each published doc adds 4 writes (draft sys update, published copy,
    // scheduled delete, version snapshot), and writes are split across
    // batches of at most 400 => 120 docs = 480 writes = 2 batches (400 + 80).
    expect(batches.length).toBe(2);
    expect(batches[0].numWrites()).toBe(400);
    expect(batches[1].numWrites()).toBe(80);
    batches.forEach((batch) => {
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });
    expect(mocks.removeDocsFromCache).toHaveBeenCalledWith(docIds);
  });

  it('throws if a doc does not exist', async () => {
    addFakeDrafts('pages', ['exists']);

    await expect(
      cmsPublishDocs(['pages/exists', 'pages/missing'])
    ).rejects.toThrow('doc does not exist: pages/missing');
  });
});
