/**
 * A cache for published CMS reads, e.g. `ReadCache` (in-memory) or
 * `FileReadCache` (on the filesystem). Pass one to a `RootCMSClient` with
 * `new RootCMSClient(rootConfig, {cache})`.
 */
export interface RootCMSReadCache {
  /**
   * Returns the cached value for `key`, or calls `fetch()` and caches its
   * result. Each caller should get its own copy of the value.
   */
  get<T>(key: string, fetch: () => Promise<T>): Promise<T>;
}

/**
 * Options for a `ReadCache`.
 */
export interface ReadCacheOptions {
  /**
   * How long (in ms) a cached read is served before it's fetched again.
   * Defaults to 60 seconds.
   */
  ttl?: number;

  /**
   * Max number of cached reads, so that arbitrary slugs can't grow the cache
   * unbounded. The oldest reads are evicted first. Defaults to 1000.
   */
  maxEntries?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
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
export class ReadCache implements RootCMSReadCache {
  private readonly ttl: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(options?: ReadCacheOptions) {
    this.ttl = options?.ttl ?? 60 * 1000;
    this.maxEntries = options?.maxEntries ?? 1000;
  }

  /**
   * Returns the cached value for `key`, or calls `fetch()` and caches its
   * result. Concurrent reads for the same key share one fetch, and failed
   * fetches aren't cached. Each caller gets its own copy of the value so that
   * a render that mutates it can't affect other requests.
   */
  async get<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      const value = fetch();
      const newEntry: CacheEntry = {expiresAt: now + this.ttl, value};
      entry = newEntry;
      this.entries.delete(key);
      this.entries.set(key, newEntry);
      value.catch(() => {
        if (this.entries.get(key) === newEntry) {
          this.entries.delete(key);
        }
      });
      // Map iteration follows insertion order, so the first keys are the
      // oldest.
      while (this.entries.size > this.maxEntries) {
        this.entries.delete(this.entries.keys().next().value!);
      }
    }
    return cloneData((await entry.value) as T);
  }

  /**
   * Removes all cached reads.
   */
  clear() {
    this.entries.clear();
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
