import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Translation} from './l10n.js';
import {
  batchUpdateTags,
  isLocaleExcludedFromTranslations,
  loadTranslationsByHashes,
} from './l10n.js';

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
const mockCollection = vi.fn();
const mockDocumentId = vi.fn();
const mockGetDocs = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockArrayUnion = vi.fn((...args: any[]) => ({
  __type: 'arrayUnion',
  values: args,
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  doc: (...args: any[]) => mockDoc(...args),
  collection: (...args: any[]) => mockCollection(...args),
  documentId: (...args: any[]) => mockDocumentId(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  // Add other functions if they are imported but not used in the test path
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('isLocaleExcludedFromTranslations', () => {
  const originalCtx = window.__ROOT_CTX;

  afterEach(() => {
    window.__ROOT_CTX = originalCtx;
  });

  function setExcludeLocales(patterns?: string[]) {
    window.__ROOT_CTX = {
      ...originalCtx,
      excludeLocalesFromTranslations: patterns,
    } as any;
  }

  it('returns false when no patterns are configured', () => {
    setExcludeLocales();
    expect(isLocaleExcludedFromTranslations('en')).toBe(false);
    expect(isLocaleExcludedFromTranslations('ALL_es')).toBe(false);
  });

  it('matches `*` wildcard patterns', () => {
    setExcludeLocales(['ALL_*']);
    expect(isLocaleExcludedFromTranslations('ALL_es')).toBe(true);
    expect(isLocaleExcludedFromTranslations('ALL_fr')).toBe(true);
    expect(isLocaleExcludedFromTranslations('ALL_')).toBe(true);
    expect(isLocaleExcludedFromTranslations('es')).toBe(false);
    expect(isLocaleExcludedFromTranslations('es_ALL')).toBe(false);
  });

  it('matches `?` single-character wildcard patterns', () => {
    setExcludeLocales(['e?']);
    expect(isLocaleExcludedFromTranslations('en')).toBe(true);
    expect(isLocaleExcludedFromTranslations('es')).toBe(true);
    expect(isLocaleExcludedFromTranslations('e')).toBe(false);
    expect(isLocaleExcludedFromTranslations('eng')).toBe(false);
  });

  it('matches case-insensitively', () => {
    setExcludeLocales(['all_*']);
    expect(isLocaleExcludedFromTranslations('ALL_es')).toBe(true);
  });

  it('supports exact (non-wildcard) patterns', () => {
    setExcludeLocales(['de']);
    expect(isLocaleExcludedFromTranslations('de')).toBe(true);
    expect(isLocaleExcludedFromTranslations('de_DE')).toBe(false);
  });

  it('matches if any of multiple patterns match', () => {
    setExcludeLocales(['ALL_*', 'xx']);
    expect(isLocaleExcludedFromTranslations('ALL_es')).toBe(true);
    expect(isLocaleExcludedFromTranslations('xx')).toBe(true);
    expect(isLocaleExcludedFromTranslations('en')).toBe(false);
  });

  it('treats regex special chars in patterns literally', () => {
    setExcludeLocales(['en.US']);
    expect(isLocaleExcludedFromTranslations('en.US')).toBe(true);
    expect(isLocaleExcludedFromTranslations('enXUS')).toBe(false);
  });
});

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

describe('loadTranslationsByHashes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // documentId() is just a sentinel field path. query()/where() pass the
    // requested chunk straight through so the fake db (getDocs) can resolve it.
    mockDocumentId.mockReturnValue('__name__');
    mockWhere.mockImplementation((_field: any, _op: any, chunk: string[]) => ({
      chunk,
    }));
    mockQuery.mockImplementation(
      (_colRef: any, whereClause: any) => whereClause
    );
  });

  function setupFakeDb(docsByHash: Record<string, Partial<Translation>>) {
    // Resolve a query by returning only the docs whose id is in the chunk,
    // mirroring Firestore's `where(documentId(), 'in', chunk)` semantics.
    mockGetDocs.mockImplementation((q: {chunk: string[]}) => {
      const matched = q.chunk
        .filter((hash) => docsByHash[hash] !== undefined)
        .map((hash) => ({id: hash, data: () => docsByHash[hash]}));
      return {
        forEach: (cb: (doc: {id: string; data: () => any}) => void) =>
          matched.forEach(cb),
      };
    });
  }

  it('returns docs by id regardless of their tags', async () => {
    // The doc for `hash-other` is tagged for a *different* page, and
    // `hash-untagged` has no tags at all. Both must still be returned (keyed by
    // id), with their real tags intact, so the modal can detect missing tags.
    setupFakeDb({
      'hash-self': {source: 'Hello', tags: ['pages/this-page']},
      'hash-other': {source: 'World', tags: ['pages/other-page']},
      'hash-untagged': {source: 'Untagged'},
    });

    const result = await loadTranslationsByHashes([
      'hash-self',
      'hash-other',
      'hash-untagged',
    ]);

    expect(result['hash-self']).toEqual({
      source: 'Hello',
      tags: ['pages/this-page'],
    });
    // The key guarantee: a translation tagged for another page is still loaded
    // (it is fetched by id, never filtered by tag), so the modal can correctly
    // flag that it is missing the current page's tag.
    expect(result['hash-other']).toEqual({
      source: 'World',
      tags: ['pages/other-page'],
    });
    expect(result['hash-untagged']).toEqual({source: 'Untagged'});
  });

  it('omits hashes that have no translation doc', async () => {
    setupFakeDb({'hash-1': {source: 'A', tags: []}});

    const result = await loadTranslationsByHashes(['hash-1', 'hash-missing']);

    expect(result['hash-1']).toEqual({source: 'A', tags: []});
    expect(result['hash-missing']).toBeUndefined();
  });

  it('returns an empty map and issues no query for an empty hash list', async () => {
    const result = await loadTranslationsByHashes([]);

    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('dedupes hashes and chunks `in` queries into batches of 30', async () => {
    const hashes = Array.from({length: 65}, (_, i) => `hash-${i}`);
    // Duplicate and empty values must be collapsed/dropped before chunking.
    const hashesWithNoise = [...hashes, 'hash-0', 'hash-1', ''];
    const docsByHash: Record<string, Partial<Translation>> = {};
    hashes.forEach((h) => (docsByHash[h] = {source: h, tags: []}));
    setupFakeDb(docsByHash);

    const result = await loadTranslationsByHashes(hashesWithNoise);

    // 65 unique hashes, chunked by 30 => 30 + 30 + 5 = 3 queries.
    expect(mockGetDocs).toHaveBeenCalledTimes(3);
    expect(Object.keys(result)).toHaveLength(65);
  });
});
