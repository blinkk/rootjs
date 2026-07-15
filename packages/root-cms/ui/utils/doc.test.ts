import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  cmsAssignSortKeys,
  cmsCopyDoc,
  cmsCreateDoc,
  cmsSetDocSortKey,
} from './doc.js';

const mocks = vi.hoisted(() => ({
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
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

  it('updates draft, published, and scheduled docs without bumping modifiedAt', async () => {
    await cmsSetDocSortKey('pages/foo', 'a5');

    expect(mocks.updateDoc).toHaveBeenCalledTimes(3);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/foo',
      {'sys.sortKey': 'a5'}
    );
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Published/foo',
      {'sys.sortKey': 'a5'}
    );
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Scheduled/foo',
      {'sys.sortKey': 'a5'}
    );
    // Reordering must not touch any other sys field (e.g. sys.modifiedAt).
    for (const call of mocks.updateDoc.mock.calls) {
      expect(Object.keys(call[1])).toEqual(['sys.sortKey']);
    }
    expect(mocks.logAction).toHaveBeenCalledWith('doc.reorder', {
      metadata: {docId: 'pages/foo', sortKey: 'a5'},
    });
  });

  it('tolerates missing published/scheduled copies and permission errors', async () => {
    mocks.updateDoc
      .mockResolvedValueOnce(undefined) // Draft.
      .mockRejectedValueOnce({code: 'not-found'}) // Published.
      .mockRejectedValueOnce({code: 'permission-denied'}); // Scheduled.

    await expect(cmsSetDocSortKey('pages/foo', 'a5')).resolves.toBeUndefined();
    expect(mocks.logAction).toHaveBeenCalledWith('doc.reorder', {
      metadata: {docId: 'pages/foo', sortKey: 'a5'},
    });
  });

  it('rethrows unexpected errors from the published mirror', async () => {
    mocks.updateDoc
      .mockResolvedValueOnce(undefined) // Draft.
      .mockRejectedValueOnce({code: 'unavailable'}); // Published.

    await expect(cmsSetDocSortKey('pages/foo', 'a5')).rejects.toEqual({
      code: 'unavailable',
    });
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

  it('updates draft docs in a batch and mirrors to published/scheduled', async () => {
    await cmsAssignSortKeys([
      {docId: 'pages/a', sortKey: 'a1'},
      {docId: 'pages/b', sortKey: 'a2'},
    ]);

    expect(batches.length).toBe(1);
    expect(batches[0].update).toHaveBeenCalledTimes(2);
    expect(batches[0].update).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/a',
      {'sys.sortKey': 'a1'}
    );
    expect(batches[0].update).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Drafts/b',
      {'sys.sortKey': 'a2'}
    );
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    // Published + scheduled mirrors are fired individually per doc.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(4);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Published/a',
      {'sys.sortKey': 'a1'}
    );
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      'doc:Projects/test-project/Collections/pages/Scheduled/b',
      {'sys.sortKey': 'a2'}
    );
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

describe('cmsCreateDoc manual sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWindowMocks({pages: {manualSorting: true}});
  });

  it('assigns a sort key at the end of the manual order', async () => {
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

  it('does not assign a sort key when manualSorting is disabled', async () => {
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
