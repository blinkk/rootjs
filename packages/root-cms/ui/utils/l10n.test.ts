import {beforeEach, describe, expect, it, vi} from 'vitest';
import {batchUpdateTags, loadTranslationsForStrings} from './l10n.js';

// Mock values used in the function.
const mockProjectId = 'test-project-id';
const mockDb = {type: 'mock-db'};

// Mock window globals.
window.__ROOT_CTX = {
  rootConfig: {
    projectId: mockProjectId,
  },
} as any;

window.firebase = {
  db: mockDb,
} as any;

// Mock firebase/firestore.
const mockWriteBatch = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn();
const mockDoc = vi.fn();
// mockGetDoc is wired through the module mock so that loadTranslationsForStrings
// (which calls getDoc directly) can have its behaviour controlled per test.
const mockGetDoc = vi.fn();
const mockArrayUnion = vi.fn((...args: any[]) => ({
  __type: 'arrayUnion',
  values: args,
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  doc: (...args: any[]) => mockDoc(...args),
  // getDoc is routed through mockGetDoc so tests for loadTranslationsForStrings
  // can control snapshot return values. Other functions are simple stubs because
  // they are imported by l10n.ts but not exercised by these tests.
  getDoc: (...args: any[]) => mockGetDoc(...args),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

describe('batchUpdateTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup writeBatch mock to return a mock batch object.
    mockWriteBatch.mockReturnValue({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    });
  });

  it('updates tags for a single item', async () => {
    const updates = [{hash: 'hash-1', tags: ['tag1', 'tag2']}];

    // Mock doc to return a specific reference
    mockDoc.mockReturnValue('doc-ref-1');

    await batchUpdateTags(updates);

    expect(mockWriteBatch).toHaveBeenCalledWith(mockDb);
    expect(mockDoc).toHaveBeenCalledWith(
      mockDb,
      'Projects',
      mockProjectId,
      'Translations',
      'hash-1'
    );
    expect(mockArrayUnion).not.toHaveBeenCalled();
    expect(mockBatchUpdate).toHaveBeenCalledWith('doc-ref-1', {
      tags: ['tag1', 'tag2'],
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('handles multiple items in a single batch', async () => {
    const updates = [
      {hash: 'hash-1', tags: ['a']},
      {hash: 'hash-2', tags: ['b']},
    ];

    mockDoc.mockImplementation(
      (_db, _col, _proj, _sub, hash) => `doc-ref-${hash}`
    );

    await batchUpdateTags(updates);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledWith('doc-ref-hash-1', {
      tags: ['a'],
    });
    expect(mockBatchUpdate).toHaveBeenCalledWith('doc-ref-hash-2', {
      tags: ['b'],
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('splits updates into chunks of 500', async () => {
    // Generate 505 updates
    const updates = Array.from({length: 505}, (_, i) => ({
      hash: `hash-${i}`,
      tags: [`tag-${i}`],
    }));

    await batchUpdateTags(updates);

    // Should create 2 batches (500 + 5)
    expect(mockWriteBatch).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(2);

    // Total updates should be 505
    expect(mockBatchUpdate).toHaveBeenCalledTimes(505);
  });

  it('uses arrayUnion in union mode for additive-only tag updates', async () => {
    const updates = [{hash: 'hash-1', tags: ['newTag']}];

    mockDoc.mockReturnValue('doc-ref-1');

    await batchUpdateTags(updates, {mode: 'union'});

    // Verify arrayUnion is called with the tags (not a plain array replacement).
    expect(mockArrayUnion).toHaveBeenCalledWith('newTag');
    expect(mockBatchUpdate).toHaveBeenCalledWith('doc-ref-1', {
      tags: {__type: 'arrayUnion', values: ['newTag']},
    });
  });
});

describe('loadTranslationsForStrings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty map for an empty strings array', async () => {
    const result = await loadTranslationsForStrings([]);
    expect(result).toEqual({});
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('fetches translations for the provided strings', async () => {
    mockDoc.mockImplementation(
      (_db, _col, _proj, _sub, hash) => `doc-ref-${hash}`
    );
    mockGetDoc.mockImplementation((ref: string) => {
      // 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d' is the SHA-1 hash of
      // the normalised string 'hello' (computed by sourceHash()).
      if (ref === 'doc-ref-aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d') {
        return Promise.resolve({
          exists: () => true,
          data: () => ({source: 'hello', en: 'hello', es: 'hola'}),
        });
      }
      return Promise.resolve({exists: () => false, data: () => undefined});
    });

    const result = await loadTranslationsForStrings(['hello']);

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    // The result map should be keyed by the hash of the normalized string.
    const hashes = Object.keys(result);
    expect(hashes).toHaveLength(1);
    expect(result[hashes[0]]).toEqual({source: 'hello', en: 'hello', es: 'hola'});
  });

  it('skips strings that have no existing translation document', async () => {
    mockDoc.mockImplementation(
      (_db, _col, _proj, _sub, hash) => `doc-ref-${hash}`
    );
    // All snapshots report non-existent.
    mockGetDoc.mockResolvedValue({exists: () => false, data: () => undefined});

    const result = await loadTranslationsForStrings(['missing string']);

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
  });

  it('fetches multiple strings in parallel and builds the map', async () => {
    mockDoc.mockImplementation(
      (_db: any, _col: any, _proj: any, _sub: any, hash: string) =>
        `doc-ref-${hash}`
    );
    // Both strings have translations.
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({source: 'some string', en: 'some string'}),
    });

    const strings = ['foo', 'bar'];
    const result = await loadTranslationsForStrings(strings);

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(Object.keys(result)).toHaveLength(2);
  });
});
