import {beforeEach, describe, expect, it, vi} from 'vitest';
import {cmsCopyDoc} from './doc.js';

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
