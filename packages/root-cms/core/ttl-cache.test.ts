import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TtlCache} from './ttl-cache.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one lookup between concurrent callers', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 10});
    const load = vi.fn(async () => 'value');
    const results = await Promise.all([
      cache.get('key', load),
      cache.get('key', load),
    ]);
    expect(results).toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads again once the ttl passes', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 10});
    const load = vi.fn(async () => 'value');
    await cache.get('key', load);
    vi.advanceTimersByTime(999);
    await cache.get('key', load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await cache.get('key', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 10});
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('backend error'))
      .mockResolvedValue('value');
    await expect(cache.get('key', load)).rejects.toThrow('backend error');
    await expect(cache.get('key', load)).resolves.toBe('value');
  });

  it('replaces a lookup that never settles once the ttl passes', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 10});
    cache.get('key', () => new Promise(() => {}));
    vi.advanceTimersByTime(1000);
    await expect(cache.get('key', async () => 'value')).resolves.toBe('value');
  });

  it('does not let a stale failure remove a newer entry', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 10});
    let fail: (err: Error) => void = () => {};
    const stale = cache.get(
      'key',
      () => new Promise((_, reject) => (fail = reject))
    );
    vi.advanceTimersByTime(1000);
    const load = vi.fn(async () => 'value');
    await cache.get('key', load);
    fail(new Error('stale'));
    await expect(stale).rejects.toThrow('stale');
    await cache.get('key', load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entry when full', async () => {
    const cache = new TtlCache<string>({ttlMs: 1000, maxEntries: 2});
    const load = vi.fn(async () => 'value');
    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('c', load);
    await cache.get('b', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
