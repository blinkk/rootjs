import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {batchUpdateTags, isLocaleExcludedFromTranslations} from './l10n.js';

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
const mockArrayUnion = vi.fn((...args: any[]) => ({
  __type: 'arrayUnion',
  values: args,
}));

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  doc: (...args: any[]) => mockDoc(...args),
  // Add other functions if they are imported but not used in the test path
  collection: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
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
