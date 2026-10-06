import {Timestamp} from 'firebase-admin/firestore';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ReadCache} from './read-cache.js';

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
});
