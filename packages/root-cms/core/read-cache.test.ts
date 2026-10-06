import os from 'node:os';
import path from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {FileSystemReadCacheStore} from './read-cache-fs-store.js';
import {
  ReadCache,
  ReadCacheStore,
  ReadCacheStoreEntry,
  clearReadCaches,
} from './read-cache.js';

/** A `ReadCacheStore` backed by a `Map`, for simulating a shared store. */
class MapStore implements ReadCacheStore {
  entries = new Map<string, ReadCacheStoreEntry>();
  async get(key: string) {
    return this.entries.get(key);
  }
  async set(key: string, entry: ReadCacheStoreEntry) {
    this.entries.set(key, entry);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  async clear() {
    this.entries.clear();
  }
}

function tmpDir() {
  return path.join(
    os.tmpdir(),
    `root-cms-read-cache-test-${Date.now()}-${Math.random()}`
  );
}

describe('ReadCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one fetch between concurrent reads', async () => {
    const cache = new ReadCache();
    const fetch = vi.fn(async () => ({title: 'hello'}));
    const [a, b] = await Promise.all([
      cache.get('key', fetch),
      cache.get('key', fetch),
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(a).toEqual({title: 'hello'});
    expect(b).toEqual({title: 'hello'});
  });

  it('fetches again once the ttl expires', async () => {
    vi.useFakeTimers();
    const cache = new ReadCache({ttl: 1000});
    let count = 0;
    const fetch = async () => ++count;
    expect(await cache.get('key', fetch)).toBe(1);
    vi.advanceTimersByTime(999);
    expect(await cache.get('key', fetch)).toBe(1);
    vi.advanceTimersByTime(1);
    expect(await cache.get('key', fetch)).toBe(2);
  });

  it('does not cache failed fetches', async () => {
    const cache = new ReadCache();
    await expect(
      cache.get('key', async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');
    expect(await cache.get('key', async () => 'ok')).toBe('ok');
  });

  it('returns a copy of the value to each caller', async () => {
    const cache = new ReadCache();
    const createdAt = Timestamp.fromMillis(1000);
    const fetch = async () => ({sys: {createdAt}, items: [{title: 'a'}]});
    const a = await cache.get('key', fetch);
    a.items[0].title = 'changed';
    const b = await cache.get('key', fetch);
    expect(b.items[0].title).toBe('a');
    // Timestamps are kept as-is.
    expect(b.sys.createdAt).toBe(createdAt);
    expect(b.sys.createdAt.toMillis()).toBe(1000);
  });

  it('evicts the oldest reads', async () => {
    const cache = new ReadCache({maxEntries: 2});
    const fetch = vi.fn(async () => 'value');
    await cache.get('a', fetch);
    await cache.get('b', fetch);
    await cache.get('c', fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    await cache.get('c', fetch);
    await cache.get('b', fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    await cache.get('a', fetch);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('supports per-type ttls', async () => {
    vi.useFakeTimers();
    const cache = new ReadCache({ttl: {default: 1000, translations: 5000}});
    let count = 0;
    const fetch = async () => ++count;
    expect(await cache.get('doc', fetch)).toBe(1);
    expect(await cache.get('t', fetch, {type: 'translations'})).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(await cache.get('doc', fetch)).toBe(3);
    expect(await cache.get('t', fetch, {type: 'translations'})).toBe(2);
    vi.advanceTimersByTime(4000);
    expect(await cache.get('t', fetch, {type: 'translations'})).toBe(4);
  });

  it('fetches uncached keys with a single getMany() call', async () => {
    const cache = new ReadCache();
    await cache.get('a', async () => 'cached');
    const fetchMany = vi.fn(async (keys: string[]) =>
      keys.map((key) => `fetched ${key}`)
    );
    const values = await cache.getMany(['a', 'b', 'c', 'b'], fetchMany);
    expect(values).toEqual(['cached', 'fetched b', 'fetched c', 'fetched b']);
    expect(fetchMany).toHaveBeenCalledOnce();
    expect(fetchMany).toHaveBeenCalledWith(['b', 'c']);
  });

  it('reads through a store shared by multiple caches', async () => {
    const store = new MapStore();
    const fetch = vi.fn(async () => ({sys: {createdAt: 1}}));
    const a = new ReadCache({store});
    const b = new ReadCache({store});
    expect(await a.get('key', fetch)).toEqual({sys: {createdAt: 1}});
    expect(await b.get('key', fetch)).toEqual({sys: {createdAt: 1}});
    expect(fetch).toHaveBeenCalledOnce();

    // Failed fetches aren't stored.
    await expect(
      a.get('error', async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');
    expect(store.entries.has('error')).toBe(false);

    await a.clear();
    expect(store.entries.size).toBe(0);
  });

  it('clears every cache with clearReadCaches()', async () => {
    const a = new ReadCache();
    const b = new ReadCache();
    let count = 0;
    const fetch = async () => ++count;
    expect(await a.get('key', fetch)).toBe(1);
    expect(await b.get('key', fetch)).toBe(2);
    await clearReadCaches();
    expect(await a.get('key', fetch)).toBe(3);
    expect(await b.get('key', fetch)).toBe(4);
  });
});

describe('FileSystemReadCacheStore', () => {
  it('shares reads across caches and preserves timestamps', async () => {
    const dir = tmpDir();
    try {
      const createdAt = Timestamp.fromMillis(1234);
      let count = 0;
      const fetch = vi.fn(async () => {
        count += 1;
        // Simulate a slow Firestore read.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {sys: {createdAt}, count};
      });
      // Each cache (and store) simulates a separate worker thread.
      const caches = Array.from(
        {length: 4},
        () => new ReadCache({store: new FileSystemReadCacheStore({dir})})
      );
      const values = await Promise.all(
        caches.map((cache) => cache.get('key', fetch))
      );
      expect(fetch).toHaveBeenCalledOnce();
      values.forEach((value) => {
        expect(value.count).toBe(1);
        expect(value.sys.createdAt).toBeInstanceOf(Timestamp);
        expect(value.sys.createdAt.toMillis()).toBe(1234);
      });
    } finally {
      await new FileSystemReadCacheStore({dir}).clear();
    }
  });

  it('fetches again when a lock times out', async () => {
    const dir = tmpDir();
    try {
      const store = new FileSystemReadCacheStore({dir, lockTimeout: 50});
      // The first get() claims the key, but never sets it.
      expect(await store.get('key')).toBeUndefined();
      const start = Date.now();
      expect(await store.get('key')).toBeUndefined();
      expect(Date.now() - start).toBeGreaterThanOrEqual(50);

      await store.set('key', {expiresAt: Date.now() + 1000, value: 'ok'});
      expect(await store.get('key')).toEqual({
        expiresAt: expect.any(Number),
        value: 'ok',
      });
      await store.delete('key');
      expect(await store.get('key')).toBeUndefined();
    } finally {
      await new FileSystemReadCacheStore({dir}).clear();
    }
  });
});
