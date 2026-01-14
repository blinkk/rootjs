import {beforeEach, describe, expect, it, vi} from 'vitest';
import {batchUpdateTags} from './l10n.js';

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

vi.mock('firebase/firestore', () => ({
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
});
