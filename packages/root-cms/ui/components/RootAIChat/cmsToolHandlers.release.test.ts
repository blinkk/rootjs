import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  executeCmsTool,
  isCmsWriteTool,
  previewCmsWriteTool,
} from './cmsToolHandlers.js';

const mocks = vi.hoisted(() => ({
  // firebase/firestore
  deleteField: vi.fn(() => '__DELETE_FIELD__'),
  doc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  // utils/release.js
  addRelease: vi.fn(),
  getRelease: vi.fn(),
  updateRelease: vi.fn(),
  // hooks/useProjectRoles.js
  fetchProjectRoles: vi.fn(),
  // utils/collection.js
  fetchCollectionSchema: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  deleteField: mocks.deleteField,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  Timestamp: class MockTimestamp {},
}));

vi.mock('../../utils/release.js', () => ({
  addRelease: mocks.addRelease,
  getRelease: mocks.getRelease,
  updateRelease: mocks.updateRelease,
}));

vi.mock('../../hooks/useProjectRoles.js', () => ({
  fetchProjectRoles: mocks.fetchProjectRoles,
}));

vi.mock('../../utils/collection.js', () => ({
  fetchCollectionSchema: mocks.fetchCollectionSchema,
}));

const mockDb = {type: 'mock-db'};

/** Draft doc paths that "exist" in the mocked Firestore. */
let existingDrafts: Set<string>;

function draftPath(collectionId: string, slug: string): string {
  return `Projects/test-project/Collections/${collectionId}/Drafts/${slug}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteField.mockReturnValue('__DELETE_FIELD__');
  existingDrafts = new Set([
    draftPath('Pages', 'home'),
    draftPath('Pages', 'about'),
    draftPath('BlogPosts', 'launch'),
    draftPath('Pages', 'foo--bar'),
  ]);
  mocks.doc.mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }));
  mocks.getDoc.mockImplementation(async (ref: {path: string}) => ({
    exists: () => existingDrafts.has(ref.path),
    data: () => ({}),
  }));
  mocks.fetchProjectRoles.mockResolvedValue({
    'admin@example.com': 'ADMIN',
    'viewer@example.com': 'VIEWER',
  });
  mocks.getRelease.mockResolvedValue(null);
  (window as any).__ROOT_CTX = {
    rootConfig: {projectId: 'test-project'},
  };
  (window as any).firebase = {
    db: mockDb,
    user: {email: 'admin@example.com'},
  };
});

describe('release write tool registration', () => {
  it('treats release_create and release_update as write tools', () => {
    expect(isCmsWriteTool('release_create')).toBe(true);
    expect(isCmsWriteTool('release_update')).toBe(true);
    expect(isCmsWriteTool('releases_list')).toBe(false);
    expect(isCmsWriteTool('release_get')).toBe(false);
  });
});

describe('release_create', () => {
  it('creates a release with deduped, sorted, canonicalized doc ids', async () => {
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'spring-launch',
      description: 'Spring launch docs',
      docIds: ['Pages/home', 'BlogPosts/launch', 'Pages/home', 'Pages/foo/bar'],
    });
    expect(result.success).toBe(true);
    expect(mocks.addRelease).toHaveBeenCalledWith('spring-launch', {
      description: 'Spring launch docs',
      docIds: ['BlogPosts/launch', 'Pages/foo--bar', 'Pages/home'],
    });
    expect(result.receipt.adminUrl).toBe('/cms/releases/spring-launch');
    expect(result.receipt.linkLabel).toBe('Open release');
  });

  it('allows creating an empty release without docIds', async () => {
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'empty-release',
    });
    expect(result.success).toBe(true);
    expect(mocks.addRelease).toHaveBeenCalledWith('empty-release', {
      docIds: [],
    });
  });

  it('rejects an invalid release id', async () => {
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'Bad Release!',
    });
    expect(result).toMatchObject({success: false, error: 'INVALID_RELEASE_ID'});
    expect(mocks.addRelease).not.toHaveBeenCalled();
  });

  it('rejects users without publish permission', async () => {
    (window as any).firebase.user.email = 'viewer@example.com';
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'spring-launch',
    });
    expect(result).toMatchObject({success: false, error: 'PERMISSION_DENIED'});
    expect(mocks.addRelease).not.toHaveBeenCalled();
  });

  it('rejects when the release already exists', async () => {
    mocks.getRelease.mockResolvedValue({id: 'spring-launch'});
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'spring-launch',
    });
    expect(result).toMatchObject({success: false, error: 'ALREADY_EXISTS'});
    expect(mocks.addRelease).not.toHaveBeenCalled();
  });

  it('rejects docs that do not exist or are malformed', async () => {
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'spring-launch',
      docIds: ['Pages/home', 'Pages/missing', 'no-slash'],
    });
    expect(result).toMatchObject({success: false, error: 'INVALID_DOC_IDS'});
    expect(result.errors).toEqual([
      {docId: 'Pages/missing', message: 'Doc does not exist as a draft.'},
      {
        docId: 'no-slash',
        message: 'Doc id must use the form "Collection/slug".',
      },
    ]);
    expect(mocks.addRelease).not.toHaveBeenCalled();
  });

  it('rejects a malformed docIds payload', async () => {
    const result: any = await executeCmsTool('release_create', {
      releaseId: 'spring-launch',
      docIds: 'Pages/home',
    });
    expect(result).toMatchObject({success: false, error: 'INVALID_INPUT'});
  });

  it('returns a preview with a release approve label', async () => {
    const preview = await previewCmsWriteTool('release_create', {
      releaseId: 'spring-launch',
      docIds: ['Pages/home'],
    });
    expect(preview.error).toBeUndefined();
    expect(preview.approveLabel).toBe('Approve release change');
    expect(preview.before).toEqual({});
    expect(preview.after).toEqual({
      id: 'spring-launch',
      docIds: ['Pages/home'],
    });
  });
});

describe('release_update', () => {
  function unpublishedRelease(overrides: Record<string, unknown> = {}) {
    return {
      id: 'spring-launch',
      description: 'Spring launch',
      docIds: ['Pages/about', 'Pages/home'],
      ...overrides,
    };
  }

  it('adds and removes docs in a single update', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
      removeDocIds: ['Pages/about'],
    });
    expect(result.success).toBe(true);
    expect(result.addedDocIds).toEqual(['BlogPosts/launch']);
    expect(result.removedDocIds).toEqual(['Pages/about']);
    expect(mocks.updateRelease).toHaveBeenCalledWith('spring-launch', {
      docIds: ['BlogPosts/launch', 'Pages/home'],
    });
    expect(result.receipt.adminUrl).toBe('/cms/releases/spring-launch');
  });

  it('removes docs referenced by their nested (slash) form', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({docIds: ['Pages/foo--bar', 'Pages/home']})
    );
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      removeDocIds: ['Pages/foo/bar'],
    });
    expect(result.success).toBe(true);
    expect(mocks.updateRelease).toHaveBeenCalledWith('spring-launch', {
      docIds: ['Pages/home'],
    });
  });

  it('allows removing docs that no longer exist as drafts', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({docIds: ['Pages/deleted-doc', 'Pages/home']})
    );
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      removeDocIds: ['Pages/deleted-doc'],
    });
    expect(result.success).toBe(true);
    expect(mocks.updateRelease).toHaveBeenCalledWith('spring-launch', {
      docIds: ['Pages/home'],
    });
  });

  it('updates only the description when no doc changes are given', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      description: 'New description',
    });
    expect(result.success).toBe(true);
    expect(mocks.updateRelease).toHaveBeenCalledWith('spring-launch', {
      docIds: ['Pages/about', 'Pages/home'],
      description: 'New description',
    });
  });

  it('clears the description when an empty string is passed', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      description: '',
    });
    expect(result.success).toBe(true);
    expect(mocks.updateRelease).toHaveBeenCalledWith('spring-launch', {
      docIds: ['Pages/about', 'Pages/home'],
      description: '__DELETE_FIELD__',
    });
  });

  it('rejects updates to a scheduled release', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({scheduledAt: {toMillis: () => 1234}})
    );
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
    });
    expect(result).toMatchObject({
      success: false,
      error: 'RELEASE_NOT_EDITABLE',
    });
    expect(result.message).toContain('scheduled');
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('rejects updates to a published release', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({publishedAt: {toMillis: () => 1234}})
    );
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
    });
    expect(result).toMatchObject({
      success: false,
      error: 'RELEASE_NOT_EDITABLE',
    });
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('rejects updates to an archived release', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({archivedAt: {toMillis: () => 1234}})
    );
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
    });
    expect(result).toMatchObject({
      success: false,
      error: 'RELEASE_NOT_EDITABLE',
    });
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('rejects updates to a missing release', async () => {
    mocks.getRelease.mockResolvedValue(null);
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'nope',
      addDocIds: ['Pages/home'],
    });
    expect(result).toMatchObject({success: false, error: 'NOT_FOUND'});
  });

  it('rejects a call with no requested changes', async () => {
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
    });
    expect(result).toMatchObject({success: false, error: 'NO_CHANGES'});
    expect(mocks.getRelease).not.toHaveBeenCalled();
  });

  it('rejects a no-op update (add existing doc, remove absent doc)', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['Pages/home'],
      removeDocIds: ['Pages/not-in-release'],
    });
    expect(result).toMatchObject({success: false, error: 'NO_CHANGES'});
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('rejects users without publish permission', async () => {
    (window as any).firebase.user.email = 'viewer@example.com';
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['Pages/home'],
    });
    expect(result).toMatchObject({success: false, error: 'PERMISSION_DENIED'});
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('rejects adds of docs that do not exist', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const result: any = await executeCmsTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['Pages/missing'],
    });
    expect(result).toMatchObject({success: false, error: 'INVALID_DOC_IDS'});
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('previews the before/after doc lists', async () => {
    mocks.getRelease.mockResolvedValue(unpublishedRelease());
    const preview = await previewCmsWriteTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
      removeDocIds: ['Pages/about'],
      description: 'Updated description',
    });
    expect(preview.error).toBeUndefined();
    expect(preview.approveLabel).toBe('Approve release change');
    expect(preview.before).toEqual({
      id: 'spring-launch',
      description: 'Spring launch',
      docIds: ['Pages/about', 'Pages/home'],
    });
    expect(preview.after).toEqual({
      id: 'spring-launch',
      description: 'Updated description',
      docIds: ['BlogPosts/launch', 'Pages/home'],
    });
    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it('previews an error for a scheduled release', async () => {
    mocks.getRelease.mockResolvedValue(
      unpublishedRelease({scheduledAt: {toMillis: () => 1234}})
    );
    const preview = await previewCmsWriteTool('release_update', {
      releaseId: 'spring-launch',
      addDocIds: ['BlogPosts/launch'],
    });
    expect(preview.error).toBe('RELEASE_NOT_EDITABLE');
    expect(preview.hint).toContain('unschedule');
  });
});
