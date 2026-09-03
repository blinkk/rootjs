import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  resetFollowRateLimit,
  resolveFollowTarget,
  testFollowRateLimit,
} from './follow-mode.js';
import {PreviewDocCandidate} from './preview-doc-match.js';

const {getDocFromCacheOrFetch} = vi.hoisted(() => ({
  getDocFromCacheOrFetch: vi.fn(),
}));

vi.mock('./doc-cache.js', () => ({
  getDocFromCacheOrFetch: getDocFromCacheOrFetch,
}));

/** Builds a candidate, defaulting the fields the resolver doesn't read. */
function candidate(
  collectionId: string,
  slug: string,
  locale = ''
): PreviewDocCandidate {
  return {collectionId, slug, locale, specificity: 0, segments: 1};
}

/** Stubs the db with a fixed set of existing docs. */
function setDocs(docs: Record<string, any>) {
  getDocFromCacheOrFetch.mockImplementation(async (docId: string) => {
    return docs[docId];
  });
}

beforeEach(() => {
  getDocFromCacheOrFetch.mockReset();
  resetFollowRateLimit();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveFollowTarget', () => {
  it('returns the highest-ranked candidate that exists', async () => {
    setDocs({'Pages/about': {sys: {}}});
    const target = await resolveFollowTarget([
      candidate('BlogPosts', 'about'),
      candidate('Pages', 'about'),
    ]);
    expect(target).toEqual({docId: 'Pages/about', locale: ''});
  });

  // The first hit wins, so a well-ranked match shouldn't cost extra reads.
  it('stops probing once a doc is found', async () => {
    setDocs({'Pages/about': {sys: {}}, 'Pages/about--index': {sys: {}}});
    await resolveFollowTarget([
      candidate('Pages', 'about'),
      candidate('Pages', 'about--index'),
    ]);
    expect(getDocFromCacheOrFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when no candidate exists', async () => {
    setDocs({});
    expect(await resolveFollowTarget([candidate('Pages', 'nope')])).toBe(null);
  });

  it('returns null for an empty candidate list', async () => {
    setDocs({});
    expect(await resolveFollowTarget([])).toBe(null);
    expect(getDocFromCacheOrFetch).not.toHaveBeenCalled();
  });

  it('skips candidates whose lookup fails', async () => {
    getDocFromCacheOrFetch.mockImplementation(async (docId: string) => {
      if (docId === 'Pages/denied') {
        throw new Error('permission-denied');
      }
      return {sys: {}};
    });
    const target = await resolveFollowTarget([
      candidate('Pages', 'denied'),
      candidate('Pages', 'ok'),
    ]);
    expect(target).toEqual({docId: 'Pages/ok', locale: ''});
  });

  // `getDocFromCacheOrFetch()` only caches hits, so without a miss memo every
  // load of a page that isn't a doc would re-read every candidate.
  it('remembers misses so they are not re-read', async () => {
    setDocs({});
    await resolveFollowTarget([candidate('Pages', 'missing')]);
    await resolveFollowTarget([candidate('Pages', 'missing')]);
    expect(getDocFromCacheOrFetch).toHaveBeenCalledTimes(1);
  });

  it('re-checks a missing doc once the memo expires', async () => {
    setDocs({});
    await resolveFollowTarget([candidate('Pages', 'missing')]);
    vi.advanceTimersByTime(61 * 1000);
    setDocs({'Pages/missing': {sys: {}}});
    const target = await resolveFollowTarget([candidate('Pages', 'missing')]);
    expect(target).toEqual({docId: 'Pages/missing', locale: ''});
  });

  it('carries the locale over when the doc has it', async () => {
    setDocs({'Pages/about': {sys: {locales: ['en', 'de']}}});
    const target = await resolveFollowTarget([
      candidate('Pages', 'about', 'de'),
    ]);
    expect(target).toEqual({docId: 'Pages/about', locale: 'de'});
  });

  // A locale the doc doesn't have would leave the editor's locale select
  // showing a value that isn't one of its options.
  it('drops a locale the doc does not have', async () => {
    setDocs({'Pages/about': {sys: {locales: ['en']}}});
    const target = await resolveFollowTarget([
      candidate('Pages', 'about', 'de'),
    ]);
    expect(target).toEqual({docId: 'Pages/about', locale: ''});
  });
});

describe('testFollowRateLimit', () => {
  it('allows a normal rate of navigation', () => {
    for (let i = 0; i < 20; i++) {
      expect(testFollowRateLimit()).toBe(true);
      vi.advanceTimersByTime(3000);
    }
  });

  it('trips on a burst of follows', () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(testFollowRateLimit());
    }
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('recovers once the window passes', () => {
    for (let i = 0; i < 6; i++) {
      testFollowRateLimit();
    }
    vi.advanceTimersByTime(5001);
    expect(testFollowRateLimit()).toBe(true);
  });

  it('is cleared by resetFollowRateLimit', () => {
    for (let i = 0; i < 6; i++) {
      testFollowRateLimit();
    }
    resetFollowRateLimit();
    expect(testFollowRateLimit()).toBe(true);
  });
});
