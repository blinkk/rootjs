import {beforeEach, describe, expect, it, vi} from 'vitest';

const getDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  getDoc: (ref: any) => getDocMock(ref),
}));

vi.mock('./doc.js', () => ({
  getDraftDocRef: (docId: string) => ({docId}),
}));

import {
  getDocFromCacheOrFetch,
  removeDocFromCache,
  setDocToCache,
} from './doc-cache.js';

describe('getDocFromCacheOrFetch', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    removeDocFromCache('Pages/foo');
  });

  it('dedupes concurrent fetches for the same doc into one request', async () => {
    let resolveFetch: (data: any) => void = () => {};
    getDocMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = (data: any) => resolve({data: () => data});
      })
    );

    // Kick off several concurrent requests before the fetch resolves.
    const p1 = getDocFromCacheOrFetch('Pages/foo');
    const p2 = getDocFromCacheOrFetch('Pages/foo');
    const p3 = getDocFromCacheOrFetch('Pages/foo');

    resolveFetch({title: 'Foo'});
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({title: 'Foo'});
    expect(r2).toEqual({title: 'Foo'});
    expect(r3).toEqual({title: 'Foo'});
  });

  it('serves subsequent reads from the cache without re-fetching', async () => {
    getDocMock.mockResolvedValue({data: () => ({title: 'Bar'})});

    const first = await getDocFromCacheOrFetch('Pages/foo');
    const second = await getDocFromCacheOrFetch('Pages/foo');

    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({title: 'Bar'});
    expect(second).toEqual({title: 'Bar'});
  });

  it('clears the in-flight promise on completion so errors can be retried', async () => {
    getDocMock.mockRejectedValueOnce(new Error('network'));
    await expect(getDocFromCacheOrFetch('Pages/foo')).rejects.toThrow(
      'network'
    );

    getDocMock.mockResolvedValueOnce({data: () => ({title: 'Retry'})});
    const retried = await getDocFromCacheOrFetch('Pages/foo');

    expect(getDocMock).toHaveBeenCalledTimes(2);
    expect(retried).toEqual({title: 'Retry'});
  });

  it('removeDocFromCache also clears any pending fetch', async () => {
    setDocToCache('Pages/foo', {title: 'Cached'});
    expect(await getDocFromCacheOrFetch('Pages/foo')).toEqual({
      title: 'Cached',
    });
    expect(getDocMock).toHaveBeenCalledTimes(0);
  });
});
