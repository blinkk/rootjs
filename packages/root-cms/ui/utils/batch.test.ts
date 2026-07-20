import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MultiBatch} from './batch.js';

const mockDb = {type: 'mock-db'};

// Mock firebase/firestore. Each call to `writeBatch()` returns a new mock
// batch that records its writes so tests can verify how writes are
// distributed across the underlying batches.
interface MockBatch {
  set: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  numWrites: () => number;
}

const mockBatches: MockBatch[] = [];
const commitOrder: number[] = [];

vi.mock('firebase/firestore', () => ({
  writeBatch: () => {
    const index = mockBatches.length;
    const batch: MockBatch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => {
        commitOrder.push(index);
      }),
      numWrites: () =>
        batch.set.mock.calls.length +
        batch.update.mock.calls.length +
        batch.delete.mock.calls.length,
    };
    mockBatches.push(batch);
    return batch;
  },
}));

describe('MultiBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatches.length = 0;
    commitOrder.length = 0;
  });

  it('uses a single underlying batch for a small number of writes', async () => {
    const batch = new MultiBatch(mockDb as any);
    batch.update('ref-1' as any, {foo: 1});
    batch.set('ref-2' as any, {bar: 2});
    batch.delete('ref-3' as any);
    await batch.commit();

    expect(mockBatches).toHaveLength(1);
    expect(mockBatches[0].update).toHaveBeenCalledWith('ref-1', {foo: 1});
    expect(mockBatches[0].set).toHaveBeenCalledWith('ref-2', {bar: 2});
    expect(mockBatches[0].delete).toHaveBeenCalledWith('ref-3');
    expect(mockBatches[0].commit).toHaveBeenCalledTimes(1);
  });

  it('splits writes across multiple batches when exceeding the limit', async () => {
    const batch = new MultiBatch(mockDb as any, {maxWritesPerBatch: 10});
    for (let i = 0; i < 25; i++) {
      batch.set(`ref-${i}` as any, {i});
    }
    await batch.commit();

    // 25 writes with a limit of 10 => batches of 10 + 10 + 5.
    expect(mockBatches).toHaveLength(3);
    expect(mockBatches[0].numWrites()).toBe(10);
    expect(mockBatches[1].numWrites()).toBe(10);
    expect(mockBatches[2].numWrites()).toBe(5);
    mockBatches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
  });

  it('commits underlying batches sequentially in insertion order', async () => {
    const batch = new MultiBatch(mockDb as any, {maxWritesPerBatch: 2});
    for (let i = 0; i < 6; i++) {
      batch.set(`ref-${i}` as any, {i});
    }
    await batch.commit();

    expect(commitOrder).toEqual([0, 1, 2]);
  });

  it('keeps grouped writes in the same batch with ensureCapacity()', async () => {
    const batch = new MultiBatch(mockDb as any, {maxWritesPerBatch: 10});
    // Add 3 groups of 4 writes each. Without ensureCapacity, the 3rd group
    // would straddle batches (8 + 2 in the first batch, 2 in the second).
    for (let group = 0; group < 3; group++) {
      batch.ensureCapacity(4);
      for (let i = 0; i < 4; i++) {
        batch.set(`ref-${group}-${i}` as any, {group, i});
      }
    }
    await batch.commit();

    expect(mockBatches).toHaveLength(2);
    // Groups 1-2 fit in the first batch, group 3 rolls to a new batch.
    expect(mockBatches[0].numWrites()).toBe(8);
    expect(mockBatches[1].numWrites()).toBe(4);
  });

  it('does not create an empty leading batch when ensureCapacity() is called first', async () => {
    const batch = new MultiBatch(mockDb as any, {maxWritesPerBatch: 10});
    batch.ensureCapacity(4);
    batch.set('ref-1' as any, {foo: 1});
    await batch.commit();

    expect(mockBatches).toHaveLength(1);
    expect(mockBatches[0].numWrites()).toBe(1);
  });

  it('commits nothing when no writes were added', async () => {
    const batch = new MultiBatch(mockDb as any);
    await batch.commit();
    expect(mockBatches).toHaveLength(0);
  });

  it('stops committing subsequent batches when a commit fails', async () => {
    const batch = new MultiBatch(mockDb as any, {maxWritesPerBatch: 2});
    for (let i = 0; i < 6; i++) {
      batch.set(`ref-${i}` as any, {i});
    }
    mockBatches[1].commit.mockRejectedValueOnce(new Error('commit failed'));

    await expect(batch.commit()).rejects.toThrow('commit failed');
    expect(mockBatches[0].commit).toHaveBeenCalledTimes(1);
    expect(mockBatches[1].commit).toHaveBeenCalledTimes(1);
    // The batch after the failed one is never committed.
    expect(mockBatches[2].commit).not.toHaveBeenCalled();
  });
});
