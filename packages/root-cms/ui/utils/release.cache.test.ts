import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Release} from './release.js';

const mocks = vi.hoisted(() => ({
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => ({type: 'now'}),
    fromMillis: (millis: number) => ({type: 'timestamp', millis}),
  },
  collection: (_db: unknown, ...path: string[]) => `col:${path.join('/')}`,
  deleteDoc: mocks.deleteDoc,
  deleteField: () => ({type: 'deleteField'}),
  doc: (_db: unknown, ...path: string[]) => `doc:${path.join('/')}`,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  orderBy: (field: string) => `orderBy:${field}`,
  query: (ref: unknown) => ref,
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => ({type: 'serverTimestamp'}),
  updateDoc: mocks.updateDoc,
}));

vi.mock('./actions.js', () => ({logAction: vi.fn()}));
vi.mock('./batch.js', () => ({MultiBatch: class {}}));
vi.mock('./data-source.js', () => ({cmsPublishDataSources: vi.fn()}));
vi.mock('./doc.js', () => ({
  cmsPublishDocs: vi.fn(),
  cmsSyncDependencyGraph: vi.fn(),
}));

/** Stubs the response of `listReleases()`. */
function mockReleases(releases: Partial<Release>[]) {
  mocks.getDocs.mockResolvedValue({
    forEach: (cb: (doc: {data: () => Partial<Release>}) => void) => {
      releases.forEach((release) => cb({data: () => release}));
    },
  });
}

// The releases cache is module-level state, so each test imports a fresh copy
// of the module.
async function importReleaseUtils() {
  vi.resetModules();
  return await import('./release.js');
}

describe('releases cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__ROOT_CTX = {rootConfig: {projectId: 'test-project'}} as any;
    window.firebase = {
      db: {type: 'mock-db'},
      user: {email: 'editor@example.com'},
    } as any;
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.deleteDoc.mockResolvedValue(undefined);
    mockReleases([]);
  });

  it('caches the releases and re-uses them on subsequent fetches', async () => {
    const {listReleasesFromCacheOrFetch} = await importReleaseUtils();
    mockReleases([{id: 'release-a'}]);

    const first = await listReleasesFromCacheOrFetch();
    const second = await listReleasesFromCacheOrFetch();

    expect(mocks.getDocs).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{id: 'release-a'}]);
    expect(second).toEqual([{id: 'release-a'}]);
  });

  it('dedupes concurrent fetches into a single request', async () => {
    const {listReleasesFromCacheOrFetch} = await importReleaseUtils();
    mockReleases([{id: 'release-a'}]);

    await Promise.all([
      listReleasesFromCacheOrFetch(),
      listReleasesFromCacheOrFetch(),
    ]);

    expect(mocks.getDocs).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when forced', async () => {
    const {listReleasesFromCacheOrFetch} = await importReleaseUtils();
    mockReleases([{id: 'release-a'}]);

    await listReleasesFromCacheOrFetch();
    await listReleasesFromCacheOrFetch({force: true});

    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('notifies subscribers when docs are added to a release', async () => {
    const {listReleasesFromCacheOrFetch, subscribeToReleases, updateRelease} =
      await importReleaseUtils();
    mockReleases([{id: 'release-a', docIds: ['Pages/foo']}]);
    await listReleasesFromCacheOrFetch();

    const listener = vi.fn();
    subscribeToReleases(listener);
    await updateRelease('release-a', {docIds: ['Pages/foo', 'Pages/bar']});

    expect(listener).toHaveBeenCalledWith([
      {id: 'release-a', docIds: ['Pages/foo', 'Pages/bar']},
    ]);
  });

  it('adds newly created releases to the cache', async () => {
    const {addRelease, getCachedReleases, listReleasesFromCacheOrFetch} =
      await importReleaseUtils();
    mockReleases([{id: 'release-a'}]);
    await listReleasesFromCacheOrFetch();
    mocks.runTransaction.mockImplementation(async (_db: unknown, fn: any) => {
      await fn({
        get: async () => ({exists: () => false}),
        set: () => {},
      });
    });

    await addRelease('release-b', {docIds: ['Pages/foo']});

    expect(getCachedReleases()).toEqual([
      {
        id: 'release-b',
        docIds: ['Pages/foo'],
        createdAt: {type: 'now'},
        createdBy: 'editor@example.com',
      },
      {id: 'release-a'},
    ]);
  });

  it('removes deleted releases from the cache', async () => {
    const {deleteRelease, getCachedReleases, listReleasesFromCacheOrFetch} =
      await importReleaseUtils();
    mockReleases([{id: 'release-a'}, {id: 'release-b'}]);
    await listReleasesFromCacheOrFetch();

    await deleteRelease('release-a');

    expect(getCachedReleases()).toEqual([{id: 'release-b'}]);
  });

  it('marks archived releases as no longer pending', async () => {
    const {
      archiveRelease,
      getCachedReleases,
      isPendingRelease,
      listReleasesFromCacheOrFetch,
    } = await importReleaseUtils();
    mockReleases([{id: 'release-a'}]);
    await listReleasesFromCacheOrFetch();

    await archiveRelease('release-a');

    const releases = getCachedReleases()!;
    expect(releases.filter(isPendingRelease)).toEqual([]);
    expect(releases[0].archivedBy).toEqual('editor@example.com');
  });

  it('clears deleted fields from the cache when unarchiving', async () => {
    const {
      getCachedReleases,
      isPendingRelease,
      listReleasesFromCacheOrFetch,
      unarchiveRelease,
    } = await importReleaseUtils();
    mockReleases([
      {id: 'release-a', archivedAt: {type: 'now'} as any, archivedBy: 'a@b.c'},
    ]);
    await listReleasesFromCacheOrFetch();

    await unarchiveRelease('release-a');

    expect(getCachedReleases()).toEqual([{id: 'release-a'}]);
    expect(getCachedReleases()!.filter(isPendingRelease)).toHaveLength(1);
  });

  it('does not populate a partial cache before the releases are fetched', async () => {
    const {getCachedReleases, updateRelease} = await importReleaseUtils();

    await updateRelease('release-a', {docIds: ['Pages/foo']});

    expect(getCachedReleases()).toBe(null);
  });
});
