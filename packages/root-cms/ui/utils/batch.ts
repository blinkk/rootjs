import {
  DocumentData,
  DocumentReference,
  Firestore,
  PartialWithFieldValue,
  SetOptions,
  UpdateData,
  WriteBatch,
  writeBatch,
} from 'firebase/firestore';

/**
 * Firestore write batches support a maximum of 500 writes per batch. Use a
 * conservative limit to leave headroom for callers that add a few extra
 * writes of their own (e.g. releases add data source writes and a release
 * status update).
 */
const MAX_WRITES_PER_BATCH = 400;

/**
 * A wrapper around firestore's `WriteBatch` that automatically splits writes
 * across multiple underlying batches whenever the number of writes exceeds
 * firestore's per-batch limit. This allows callers (e.g. release publishing)
 * to batch an arbitrary number of writes without hitting the limit.
 *
 * Note that while each underlying batch is committed atomically, atomicity is
 * NOT guaranteed across batches. Batches are committed sequentially in the
 * order writes were added, so callers should add writes in an order where a
 * partial failure leaves the system in a retryable state (e.g. add a "status"
 * write last so it only commits after everything else succeeded).
 */
export class MultiBatch {
  private readonly db: Firestore;
  private readonly maxWritesPerBatch: number;
  private batches: WriteBatch[] = [];
  private currentBatchSize = 0;

  constructor(db: Firestore, options?: {maxWritesPerBatch?: number}) {
    this.db = db;
    this.maxWritesPerBatch = options?.maxWritesPerBatch ?? MAX_WRITES_PER_BATCH;
  }

  /**
   * Starts a new underlying batch if the current one doesn't have capacity
   * for `numWrites` more writes. Call this before adding a group of related
   * writes to guarantee the whole group is committed atomically within a
   * single underlying batch.
   */
  ensureCapacity(numWrites: number): this {
    if (
      this.batches.length > 0 &&
      this.currentBatchSize + numWrites > this.maxWritesPerBatch
    ) {
      this.batches.push(writeBatch(this.db));
      this.currentBatchSize = 0;
    }
    return this;
  }

  set(
    ref: DocumentReference,
    data: PartialWithFieldValue<DocumentData>,
    options?: SetOptions
  ): this {
    if (options) {
      this.nextBatch().set(ref, data, options);
    } else {
      this.nextBatch().set(ref, data);
    }
    return this;
  }

  update(ref: DocumentReference, data: UpdateData<DocumentData>): this {
    this.nextBatch().update(ref, data);
    return this;
  }

  delete(ref: DocumentReference): this {
    this.nextBatch().delete(ref);
    return this;
  }

  /**
   * Commits the underlying batches sequentially, in the order writes were
   * added. If a batch fails to commit, subsequent batches are not committed.
   */
  async commit(): Promise<void> {
    const batches = this.batches;
    this.batches = [];
    this.currentBatchSize = 0;
    for (const batch of batches) {
      await batch.commit();
    }
  }

  private nextBatch(): WriteBatch {
    if (
      this.batches.length === 0 ||
      this.currentBatchSize >= this.maxWritesPerBatch
    ) {
      this.batches.push(writeBatch(this.db));
      this.currentBatchSize = 0;
    }
    this.currentBatchSize += 1;
    return this.batches[this.batches.length - 1];
  }
}
