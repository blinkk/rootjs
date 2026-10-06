import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FileReadCache} from './file-read-cache.js';

describe('FileReadCache', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-read-cache-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(dir, {recursive: true, force: true});
  });

  it('shares cached reads between instances', async () => {
    // Each instance stands in for a different thread (or process).
    const a = new FileReadCache({dir});
    const b = new FileReadCache({dir});
    const fetch = vi.fn(async () => ({title: 'hello'}));
    expect(await a.get('key', fetch)).toEqual({title: 'hello'});
    expect(await b.get('key', fetch)).toEqual({title: 'hello'});
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('shares one fetch between concurrent reads', async () => {
    const caches = [0, 1, 2, 3].map(() => new FileReadCache({dir}));
    let resolveFetch!: (value: string) => void;
    const fetch = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const results = Promise.all(
      [...caches, caches[0]].map((cache) => cache.get('key', fetch))
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    resolveFetch('value');
    expect(await results).toEqual([
      'value',
      'value',
      'value',
      'value',
      'value',
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps timestamps and returns a copy to each caller', async () => {
    const cache = new FileReadCache({dir});
    const fetch = async () => ({
      sys: {createdAt: Timestamp.fromMillis(1234)},
      items: [{title: 'a'}],
    });
    const a = await cache.get('key', fetch);
    a.items[0].title = 'changed';
    const b = await new FileReadCache({dir}).get('key', fetch);
    expect(b.items[0].title).toBe('a');
    expect(b.sys.createdAt).toBeInstanceOf(Timestamp);
    expect(b.sys.createdAt.toMillis()).toBe(1234);
  });

  it('caches null values', async () => {
    const cache = new FileReadCache({dir});
    const fetch = vi.fn(async () => null);
    expect(await cache.get('key', fetch)).toBe(null);
    expect(await cache.get('key', fetch)).toBe(null);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not cache failed fetches', async () => {
    const a = new FileReadCache({dir});
    const b = new FileReadCache({dir});
    const failed = a.get('key', async () => {
      throw new Error('failed');
    });
    const fetch = vi.fn(async () => 'ok');
    const waiting = b.get('key', fetch);
    await expect(failed).rejects.toThrow('failed');
    // The waiting reader fetches the value itself once the lock is released.
    expect(await waiting).toBe('ok');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not cache values that cannot be serialized', async () => {
    const cache = new FileReadCache({dir});
    const value = {data: Buffer.from('hi')};
    const fetch = vi.fn(async () => value);
    expect(await cache.get('key', fetch)).toBe(value);
    await cache.get('key', fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('removes stale locks', async () => {
    const cache = new FileReadCache({dir});
    await cache.get('key', async () => 'value');
    const [file] = await fs.readdir(dir);
    await fs.rm(path.join(dir, file));
    const lockPath = path.join(dir, `${file}.lock`);
    await fs.writeFile(lockPath, '');
    const past = new Date(Date.now() - 2 * 60 * 1000);
    await fs.utimes(lockPath, past, past);
    expect(await cache.get('key', async () => 'refetched')).toBe('refetched');
  });

  it('fetches again once the ttl expires', async () => {
    const cache = new FileReadCache({dir, ttl: 1000});
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(await cache.get('key', async () => 1)).toBe(1);
    expect(await cache.get('key', async () => 2)).toBe(1);
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
    expect(await cache.get('key', async () => 3)).toBe(3);
    vi.restoreAllMocks();
  });

  it('clears the cache', async () => {
    const cache = new FileReadCache({dir});
    await cache.get('key', async () => 'value');
    await cache.clear();
    expect(await cache.get('key', async () => 'new')).toBe('new');
  });
});
