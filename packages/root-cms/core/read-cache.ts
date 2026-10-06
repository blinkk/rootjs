/**
 * The type of a cached read, used for per-type ttls (see `ReadCacheTtl`).
 */
export type ReadCacheType = 'doc' | 'query' | 'translations' | 'dataSource';

/**
 * Per-read-type ttls (in ms). Types without a ttl use `default`, which
 * defaults to 60 seconds.
 */
export type ReadCacheTtl = {default?: number} & {
  [type in ReadCacheType]?: number;
};

/**
 * A cached value stored in a `ReadCacheStore`.
 */
export interface ReadCacheStoreEntry {
  /** Timestamp (in ms) when the entry expires. */
  expiresAt: number;
  /** The cached value. */
  value: unknown;
}

/**
 * A secondary storage layer for a `ReadCache`, e.g. for sharing cached reads
 * between the worker threads of an SSG build (see
 * `FileSystemReadCacheStore`). Reads are always cached in memory first, and
 * the store is only checked on an in-memory miss.
 *
 * Stored values are plain Firestore data, so a store that serializes them
 * must preserve `Timestamp` values.
 */
export interface ReadCacheStore {
  /** Returns the entry for `key`, or `undefined` if it isn't stored. */
  get(key: string): Promise<ReadCacheStoreEntry | undefined>;
  /** Stores the entry for `key`. */
  set(key: string, entry: ReadCacheStoreEntry): Promise<void>;
  /** Removes the entry for `key`, e.g. when a fetch fails. */
  delete(key: string): Promise<void>;
  /** Removes all entries. */
  clear(): Promise<void>;
}

/**
 * Options for a `ReadCache`.
 */
export interface ReadCacheOptions {
  /**
   * How long (in ms) a cached read is served before it's fetched again.
   * Defaults to 60 seconds. Pass an object to set the ttl per read type, e.g.
   * `{default: 15_000, translations: 120_000}`.
   */
  ttl?: number | ReadCacheTtl;

  /**
   * Max number of cached reads held in memory, so that arbitrary slugs can't
   * grow the cache unbounded. The oldest reads are evicted first. Defaults to
   * 1000.
   */
  maxEntries?: number;

  /**
   * Secondary storage that's checked on an in-memory miss, e.g. a
   * `FileSystemReadCacheStore` that's shared across processes.
   */
  store?: ReadCacheStore;
}

/**
 * Options for a single read.
 */
export interface ReadCacheReadOptions {
  /** The type of read, used to pick the ttl. Defaults to "doc". */
  type?: ReadCacheType;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

interface PendingRead {
  key: string;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

const DEFAULT_TTL = 60 * 1000;

/**
 * Every live `ReadCache`, for `clearReadCaches()`. Stored on `globalThis` so
 * that it's shared by every copy of this module (e.g. the copy bundled into a
 * site's server build and the copy loaded by the CMS plugin).
 */
const READ_CACHES_KEY = Symbol.for('@blinkk/root-cms/readCaches');
const readCaches: Set<WeakRef<ReadCache>> = ((globalThis as any)[
  READ_CACHES_KEY
] ??= new Set());
const readCachesRegistry = new FinalizationRegistry<WeakRef<ReadCache>>((ref) =>
  readCaches.delete(ref)
);

/**
 * Clears every `ReadCache` in the process (including their stores). Called
 * automatically when docs are published or unpublished through a
 * `RootCMSClient`.
 */
export async function clearReadCaches() {
  const caches: ReadCache[] = [];
  for (const ref of readCaches) {
    const cache = ref.deref();
    if (cache) {
      caches.push(cache);
    } else {
      readCaches.delete(ref);
    }
  }
  await Promise.all(caches.map((cache) => cache.clear()));
}

/**
 * An in-memory cache for published CMS reads, which saves a Firestore round
 * trip on most page renders. Pass one to a `RootCMSClient` with
 * `new RootCMSClient(rootConfig, {cache})`, or enable it for a route with
 * `createRoute({cache: true})`.
 *
 * Published content can take up to `ttl` to show up, so a cached client
 * shouldn't be used to serve previews.
 */
export class ReadCache {
  private readonly ttl: ReadCacheTtl;
  private readonly maxEntries: number;
  private readonly store?: ReadCacheStore;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(options?: ReadCacheOptions) {
    const ttl = options?.ttl ?? DEFAULT_TTL;
    this.ttl = typeof ttl === 'number' ? {default: ttl} : ttl;
    this.maxEntries = options?.maxEntries ?? 1000;
    this.store = options?.store;
    const ref = new WeakRef(this);
    readCaches.add(ref);
    readCachesRegistry.register(this, ref);
  }

  /**
   * Returns the cached value for `key`, or calls `fetch()` and caches its
   * result. Concurrent reads for the same key share one fetch, and failed
   * fetches aren't cached. Each caller gets its own copy of the value so that
   * a render that mutates it can't affect other requests.
   */
  async get<T>(
    key: string,
    fetch: () => Promise<T>,
    options?: ReadCacheReadOptions
  ): Promise<T> {
    const [value] = await this.getMany(
      [key],
      async () => [await fetch()],
      options
    );
    return value;
  }

  /**
   * Like `get()`, but for multiple keys. The uncached keys are fetched with a
   * single `fetchMany()` call, which must return their values in order.
   */
  async getMany<T>(
    keys: string[],
    fetchMany: (keys: string[]) => Promise<T[]>,
    options?: ReadCacheReadOptions
  ): Promise<T[]> {
    const now = Date.now();
    const ttl = this.getTtl(options?.type);
    const misses: PendingRead[] = [];
    const entries = keys.map((key) => {
      const existing = this.entries.get(key);
      if (existing && existing.expiresAt > now) {
        return existing;
      }
      let pending!: PendingRead;
      const value = new Promise((resolve, reject) => {
        pending = {key, resolve, reject};
      });
      const entry: CacheEntry = {expiresAt: now + ttl, value};
      misses.push(pending);
      this.entries.delete(key);
      this.entries.set(key, entry);
      value.catch(() => {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
      });
      return entry;
    });
    // Map iteration follows insertion order, so the first keys are the
    // oldest.
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    if (misses.length > 0) {
      this.fill(misses, fetchMany, ttl);
    }
    const values = await Promise.all(entries.map((entry) => entry.value));
    return values.map((value) => cloneData(value as T));
  }

  /**
   * Resolves pending reads from the store, then fetches the rest.
   */
  private async fill<T>(
    misses: PendingRead[],
    fetchMany: (keys: string[]) => Promise<T[]>,
    ttl: number
  ) {
    const store = this.store;
    let remaining = misses;
    try {
      if (store) {
        const stored = await Promise.all(
          misses.map((read) => store.get(read.key).catch(() => undefined))
        );
        const now = Date.now();
        remaining = [];
        misses.forEach((read, i) => {
          const entry = stored[i];
          if (entry && entry.expiresAt > now) {
            read.resolve(entry.value);
          } else {
            remaining.push(read);
          }
        });
      }
      if (remaining.length === 0) {
        return;
      }
      const values = await fetchMany(remaining.map((read) => read.key));
      remaining.forEach((read, i) => read.resolve(values[i]));
      if (store) {
        const expiresAt = Date.now() + ttl;
        await Promise.all(
          remaining.map((read, i) =>
            store.set(read.key, {expiresAt, value: values[i]}).catch((err) => {
              console.warn(`failed to store cached read: ${read.key}`, err);
            })
          )
        );
      }
    } catch (err) {
      remaining.forEach((read) => read.reject(err));
      if (store) {
        await Promise.all(
          remaining.map((read) => store.delete(read.key).catch(() => {}))
        );
      }
    }
  }

  private getTtl(type?: ReadCacheType): number {
    return this.ttl[type || 'doc'] ?? this.ttl.default ?? DEFAULT_TTL;
  }

  /**
   * Removes all cached reads, including the ones in the store.
   */
  async clear() {
    this.entries.clear();
    await this.store?.clear();
  }
}

/**
 * Deep clones the plain objects and arrays in Firestore data. Other values
 * (e.g. `Timestamp` objects) are immutable, so they're returned as-is, which
 * keeps their prototype (unlike `structuredClone()`).
 */
function cloneData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneData(item)) as T;
  }
  if (isPlainObject(value)) {
    const result: any = {};
    for (const key of Object.keys(value)) {
      result[key] = cloneData((value as any)[key]);
    }
    return result;
  }
  return value;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
