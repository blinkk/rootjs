interface TtlCacheEntry<T> {
  promise: Promise<T>;
  expiresAt: number;
}

/**
 * A small in-memory cache for async lookups. Concurrent callers for a key share
 * one lookup, and failed lookups aren't cached.
 *
 * The TTL starts when a lookup begins, not when it settles. That bounds how old
 * a value can be, and means a lookup that never settles is replaced once the
 * TTL passes rather than blocking its key forever.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, TtlCacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: {ttlMs: number; maxEntries: number}) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
  }

  /** Returns the cached value for a key, calling `load` if there isn't one. */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && now < existing.expiresAt) {
      return existing.promise;
    }
    this.entries.delete(key);
    this.evict(now);

    const entry: TtlCacheEntry<T> = {
      promise: load(),
      expiresAt: now + this.ttlMs,
    };
    this.entries.set(key, entry);
    entry.promise.catch(() => {
      // A newer lookup may have replaced this entry, so only remove this one.
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    return entry.promise;
  }

  /** Removes a key, so that the next `get()` loads it again. */
  delete(key: string) {
    this.entries.delete(key);
  }

  /** Makes room for a new entry, starting with the expired ones. */
  private evict(now: number) {
    if (this.entries.size < this.maxEntries) {
      return;
    }
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(key);
      }
    }
    // Maps iterate in insertion order, so the first key is the oldest.
    while (this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }
}
