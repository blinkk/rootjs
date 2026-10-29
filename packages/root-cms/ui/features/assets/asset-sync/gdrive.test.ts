import {afterEach, describe, expect, it, vi} from 'vitest';
import {GDRIVE_PROVIDER, parseDriveFolderUrl} from './gdrive.js';
import {
  SyncAccessError,
  SyncAuthContext,
  SyncTokenRequiredError,
} from './types.js';

const FOLDER_ID = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ012345';

const SOURCE = {
  provider: 'gdrive',
  url: `https://drive.google.com/drive/folders/${FOLDER_ID}`,
  gdrive: {folderId: FOLDER_ID},
};

const AUTH: SyncAuthContext = {
  getToken: async () => 'tok',
  invalidateToken: () => {},
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';

describe('parseDriveFolderUrl', () => {
  it('parses folder URLs', () => {
    expect(
      parseDriveFolderUrl(`https://drive.google.com/drive/folders/${FOLDER_ID}`)
    ).toEqual({folderId: FOLDER_ID});
  });

  it('parses account-scoped folder URLs with query params', () => {
    expect(
      parseDriveFolderUrl(
        `https://drive.google.com/drive/u/0/folders/${FOLDER_ID}?usp=sharing`
      )
    ).toEqual({folderId: FOLDER_ID});
  });

  it('parses open?id= URLs', () => {
    expect(
      parseDriveFolderUrl(`https://drive.google.com/open?id=${FOLDER_ID}`)
    ).toEqual({folderId: FOLDER_ID});
  });

  it('rejects non-drive URLs and file URLs', () => {
    expect(parseDriveFolderUrl('https://example.com/drive/folders/x')).toBe(
      null
    );
    expect(
      parseDriveFolderUrl(`https://drive.google.com/file/d/${FOLDER_ID}/view`)
    ).toBeNull();
    expect(parseDriveFolderUrl('https://drive.google.com/')).toBeNull();
    expect(parseDriveFolderUrl('not a url')).toBeNull();
    // Ids must look like Drive ids.
    expect(
      parseDriveFolderUrl('https://drive.google.com/drive/folders/x')
    ).toBeNull();
  });
});

describe('GDRIVE_PROVIDER.parseSourceUrl', () => {
  it('returns a source ref for drive folder URLs', () => {
    expect(GDRIVE_PROVIDER.parseSourceUrl(SOURCE.url)).toEqual({
      provider: 'gdrive',
      url: SOURCE.url,
      gdrive: {folderId: FOLDER_ID},
    });
  });

  it('returns null for unrecognized URLs', () => {
    expect(GDRIVE_PROVIDER.parseSourceUrl('https://example.com/x')).toBeNull();
  });
});

describe('GDRIVE_PROVIDER.listRemoteAssets', () => {
  /** Stubs global fetch, routing by URL substring (first match wins). */
  function stubFetch(
    routes: Array<[string, (url: string) => {status: number; body: any}]>
  ) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        const match = routes.find(([key]) => String(url).includes(key));
        const {status, body} = match
          ? match[1](String(url))
          : {status: 404, body: {}};
        const res = {
          ok: status >= 200 && status < 300,
          status,
          headers: {get: () => null},
          json: async () => body,
          clone: () => res,
        };
        return res as any;
      })
    );
    return calls;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists files with md5 hashes, skipping folders and native docs', async () => {
    stubFetch([
      [
        `/drive/v3/files/${FOLDER_ID}?`,
        () => ({status: 200, body: {id: FOLDER_ID, mimeType: FOLDER_MIME}}),
      ],
      [
        '/drive/v3/files?',
        () => ({
          status: 200,
          body: {
            files: [
              {
                id: 'file1',
                name: 'hero.png',
                mimeType: 'image/png',
                md5Checksum: 'md5-1',
              },
              {id: 'sub', name: 'Subfolder', mimeType: FOLDER_MIME},
              {
                id: 'doc1',
                name: 'Spec',
                mimeType: 'application/vnd.google-apps.document',
              },
              {id: 'file2', name: 'movie.mp4', mimeType: 'video/mp4'},
            ],
          },
        }),
      ],
    ]);
    const result = await GDRIVE_PROVIDER.listRemoteAssets(SOURCE, AUTH);
    // No cheap folder-level version on Drive.
    expect(result.version).toBeUndefined();
    expect(result.assets).toEqual([
      {
        remoteId: 'file1',
        name: 'hero.png',
        filename: 'hero.png',
        contentHash: 'md5-1',
        ref: {mimeType: 'image/png'},
      },
      {
        remoteId: 'file2',
        name: 'movie.mp4',
        filename: 'movie.mp4',
        ref: {mimeType: 'video/mp4'},
      },
    ]);
  });

  it('paginates through all pages', async () => {
    stubFetch([
      [
        `/drive/v3/files/${FOLDER_ID}?`,
        () => ({status: 200, body: {id: FOLDER_ID, mimeType: FOLDER_MIME}}),
      ],
      [
        'pageToken=page2',
        () => ({
          status: 200,
          body: {
            files: [{id: 'b', name: 'b.png', mimeType: 'image/png'}],
          },
        }),
      ],
      [
        '/drive/v3/files?',
        () => ({
          status: 200,
          body: {
            files: [{id: 'a', name: 'a.png', mimeType: 'image/png'}],
            nextPageToken: 'page2',
          },
        }),
      ],
    ]);
    const result = await GDRIVE_PROVIDER.listRemoteAssets(SOURCE, AUTH);
    expect(result.assets.map((a) => a.remoteId)).toEqual(['a', 'b']);
  });

  it('rejects URLs that point at a file rather than a folder', async () => {
    stubFetch([
      [
        `/drive/v3/files/${FOLDER_ID}?`,
        () => ({status: 200, body: {id: FOLDER_ID, mimeType: 'image/png'}}),
      ],
    ]);
    await expect(
      GDRIVE_PROVIDER.listRemoteAssets(SOURCE, AUTH)
    ).rejects.toThrow('not a folder');
  });

  it('maps 401 to SyncTokenRequiredError', async () => {
    stubFetch([
      [
        '/drive/v3/files',
        () => ({status: 401, body: {error: {message: 'Invalid credentials'}}}),
      ],
    ]);
    await expect(
      GDRIVE_PROVIDER.listRemoteAssets(SOURCE, AUTH)
    ).rejects.toThrow(SyncTokenRequiredError);
  });

  it('maps non-rate-limit 403 to SyncAccessError', async () => {
    stubFetch([
      [
        '/drive/v3/files',
        () => ({
          status: 403,
          body: {
            error: {
              message: 'Insufficient permissions',
              errors: [{reason: 'insufficientFilePermissions'}],
            },
          },
        }),
      ],
    ]);
    await expect(
      GDRIVE_PROVIDER.listRemoteAssets(SOURCE, AUTH)
    ).rejects.toThrow(SyncAccessError);
  });
});
