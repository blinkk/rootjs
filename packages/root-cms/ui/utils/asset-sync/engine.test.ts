import {describe, expect, it, vi} from 'vitest';
import type {
  Asset,
  AssetFile,
  AssetFolder,
  AssetFolderSync,
} from '../assets.js';
import {SyncEngineDeps, syncFolder} from './engine.js';
import {
  AssetSyncProvider,
  RemoteAsset,
  SyncAuthContext,
  SyncInProgressError,
  SyncRateLimitError,
} from './types.js';

/** Builds a fake Timestamp-ish value. */
function ts(millis = Date.now()): any {
  return {toMillis: () => millis};
}

const AUTH: SyncAuthContext = {
  getToken: async () => 'test-token',
  invalidateToken: () => {},
};

function makeFolder(sync?: Partial<AssetFolderSync>): AssetFolder {
  return {
    id: 'folder-icons',
    type: 'folder',
    parent: '',
    name: 'icons',
    createdAt: ts(),
    createdBy: 'a@example.com',
    modifiedAt: ts(),
    modifiedBy: 'a@example.com',
    sync: {
      provider: 'fake',
      url: 'https://example.com/source',
      connectedAt: ts(),
      connectedBy: 'a@example.com',
      ...sync,
    },
  } as AssetFolder;
}

interface FakeRemote {
  remoteId: string;
  /** Remote display name; defaults to `remoteId`. */
  name?: string;
  filename: string;
  /** File contents; the fake sha1 is `sha1:<contents>`. */
  contents: string;
  contentHash?: string;
}

/** Builds a provider serving the given remote assets. */
function makeProvider(options: {version?: string; remote: FakeRemote[]}) {
  const downloaded: string[] = [];
  const prepared: string[][] = [];
  const provider: AssetSyncProvider = {
    id: 'fake',
    label: 'Fake',
    parseSourceUrl: () => null,
    listRemoteAssets: async () => ({
      version: options.version,
      assets: options.remote.map((r) => ({
        remoteId: r.remoteId,
        name: r.name ?? r.remoteId,
        filename: r.filename,
        ...(r.contentHash ? {contentHash: r.contentHash} : {}),
        ref: {contents: r.contents},
      })),
    }),
    prepareDownloads: async (assets: RemoteAsset[]) => {
      prepared.push(assets.map((a) => a.remoteId));
    },
    download: async (asset: RemoteAsset) => {
      downloaded.push(asset.remoteId);
      const contents = (asset.ref as any).contents as string;
      return new File([contents], asset.filename, {type: 'image/png'});
    },
  };
  return {provider, downloaded, prepared};
}

/** Builds a previously-synced local asset whose bytes were `contents`. */
function makeSyncedAsset(
  remoteId: string,
  contents: string,
  overrides: Record<string, any> = {}
): AssetFile {
  return {
    id: `asset-${remoteId}`,
    type: 'file',
    parent: 'icons',
    name: `${remoteId}.png`,
    file: {src: `https://gcs.example.com/${remoteId}.png`},
    source: {
      provider: 'fake',
      remoteId: remoteId,
      contentHash: `sha1:${contents}`,
      syncedAt: ts(),
      ...overrides,
    },
    createdAt: ts(),
    createdBy: 'a@example.com',
    modifiedAt: ts(),
    modifiedBy: 'a@example.com',
  } as AssetFile;
}

/** Reads a File's text (jsdom's File lacks `.text()`). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function makeDeps(options: {
  folder: AssetFolder;
  localAssets?: Asset[];
}): SyncEngineDeps {
  return {
    getFolder: vi.fn(async () => options.folder),
    listAssets: vi.fn(async () => options.localAssets || []),
    uploadFile: vi.fn(async (file: File) => ({
      src: `https://gcs.example.com/${file.name}`,
      filename: file.name,
    })),
    createAssetFile: vi.fn(
      async (o: any) =>
        ({
          id: `created-${o.source?.remoteId || o.name}`,
          type: 'file',
          parent: o.parent,
          name: o.name,
          file: o.file,
          source: o.source,
        }) as AssetFile
    ),
    replaceAssetFile: vi.fn(async (asset: AssetFile, file: any, o: any) => ({
      ...asset,
      file,
      source: o?.source,
    })),
    syncAssetToDocs: vi.fn(async () => ({
      updatedDocIds: ['Pages/index'],
      failedDocIds: [],
    })),
    setFolderSyncState: vi.fn(async () => {}),
    finalizeFolderSync: vi.fn(async () => {}),
    updateAssetSourceMissing: vi.fn(async () => {}),
    sha1: vi.fn(async (file: File) => `sha1:${await readFileText(file)}`),
    now: () => ts(),
    logAction: vi.fn(),
  };
}

describe('syncFolder', () => {
  it('imports new assets with provenance', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({
      version: 'v1',
      remote: [
        {remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'},
        {remoteId: 'file:2:0', filename: 'b.png', contents: 'bbb'},
      ],
    });
    const deps = makeDeps({folder});
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.added).toEqual(2);
    expect(summary.updated).toEqual(0);
    expect(summary.failed).toEqual([]);
    expect(deps.createAssetFile).toHaveBeenCalledTimes(2);
    const call = (deps.createAssetFile as any).mock.calls[0][0];
    expect(call.parent).toEqual('icons');
    expect(call.source.provider).toEqual('fake');
    expect(call.source.contentHash).toEqual('sha1:aaa');
    expect(call.source.remoteVersion).toEqual('v1');
    // No replacements or fan-out for brand new assets.
    expect(deps.replaceAssetFile).not.toHaveBeenCalled();
    expect(deps.syncAssetToDocs).not.toHaveBeenCalled();
    // Successful sync advances lastRemoteVersion.
    expect(deps.finalizeFolderSync).toHaveBeenCalledWith(
      'folder-icons',
      expect.objectContaining({ok: true, added: 2}),
      {remoteVersion: 'v1'}
    );
  });

  it('performs zero writes and zero fan-out when nothing changed', async () => {
    // The invariant from the design doc: an all-unchanged re-sync performs
    // zero uploads, zero asset doc writes, and zero syncAssetToDocs calls.
    const folder = makeFolder({lastRemoteVersion: 'v1'});
    const {provider, downloaded} = makeProvider({
      // New version forces the engine past the fast path, exercising the
      // download+hash comparison tier.
      version: 'v2',
      remote: [
        {remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'},
        {remoteId: 'file:2:0', filename: 'b.png', contents: 'bbb'},
      ],
    });
    const deps = makeDeps({
      folder,
      localAssets: [
        makeSyncedAsset('file:1:0', 'aaa'),
        makeSyncedAsset('file:2:0', 'bbb'),
      ],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.unchanged).toEqual(2);
    expect(summary.added).toEqual(0);
    expect(summary.updated).toEqual(0);
    expect(downloaded.length).toEqual(2);
    // The invariant: no uploads, no asset doc writes, no fan-out.
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(deps.createAssetFile).not.toHaveBeenCalled();
    expect(deps.replaceAssetFile).not.toHaveBeenCalled();
    expect(deps.syncAssetToDocs).not.toHaveBeenCalled();
    expect(deps.updateAssetSourceMissing).not.toHaveBeenCalled();
  });

  it('skips downloads entirely when the source version is unchanged', async () => {
    const folder = makeFolder({lastRemoteVersion: 'v1'});
    const {provider, downloaded, prepared} = makeProvider({
      version: 'v1',
      remote: [{remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'}],
    });
    const deps = makeDeps({
      folder,
      localAssets: [makeSyncedAsset('file:1:0', 'aaa')],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.upToDate).toBe(true);
    expect(summary.unchanged).toEqual(1);
    expect(downloaded).toEqual([]);
    expect(prepared).toEqual([]);
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(deps.createAssetFile).not.toHaveBeenCalled();
    expect(deps.replaceAssetFile).not.toHaveBeenCalled();
    expect(deps.syncAssetToDocs).not.toHaveBeenCalled();
  });

  it('ignores the fast path when a synced asset was removed from the folder', async () => {
    // The asset was deleted/moved out of the folder in the CMS; even though
    // the source version is unchanged, the sync should re-import it.
    const folder = makeFolder({lastRemoteVersion: 'v1'});
    const {provider} = makeProvider({
      version: 'v1',
      remote: [{remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'}],
    });
    const deps = makeDeps({folder, localAssets: []});
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.upToDate).toBe(false);
    expect(summary.added).toEqual(1);
    expect(deps.createAssetFile).toHaveBeenCalledTimes(1);
  });

  it('replaces changed assets and fans out to docs', async () => {
    const folder = makeFolder({lastRemoteVersion: 'v1'});
    const {provider} = makeProvider({
      version: 'v2',
      remote: [
        {remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa-changed'},
        {remoteId: 'file:2:0', filename: 'b.png', contents: 'bbb'},
      ],
    });
    const existing = makeSyncedAsset('file:1:0', 'aaa');
    const deps = makeDeps({
      folder,
      localAssets: [existing, makeSyncedAsset('file:2:0', 'bbb')],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.updated).toEqual(1);
    expect(summary.unchanged).toEqual(1);
    expect(summary.updatedDocIds).toEqual(['Pages/index']);
    expect(deps.uploadFile).toHaveBeenCalledTimes(1);
    expect(deps.replaceAssetFile).toHaveBeenCalledTimes(1);
    const [replacedAsset, , replaceOptions] = (deps.replaceAssetFile as any)
      .mock.calls[0];
    expect(replacedAsset.id).toEqual('asset-file:1:0');
    expect(replaceOptions.source.contentHash).toEqual('sha1:aaa-changed');
    // Fan-out runs only for the changed asset, with the previous file so
    // doc-level customizations are preserved.
    expect(deps.syncAssetToDocs).toHaveBeenCalledTimes(1);
    expect((deps.syncAssetToDocs as any).mock.calls[0][1]).toEqual({
      previousFile: existing.file,
    });
  });

  it('skips the download when the provider-reported hash matches', async () => {
    const folder = makeFolder();
    const {provider, downloaded} = makeProvider({
      version: 'v2',
      remote: [
        {
          remoteId: 'file:1:0',
          filename: 'a.png',
          contents: 'aaa',
          contentHash: 'md5-abc',
        },
      ],
    });
    const deps = makeDeps({
      folder,
      localAssets: [
        makeSyncedAsset('file:1:0', 'aaa', {remoteHash: 'md5-abc'}),
      ],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.unchanged).toEqual(1);
    expect(downloaded).toEqual([]);
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(deps.replaceAssetFile).not.toHaveBeenCalled();
  });

  it('flags assets whose remote item disappeared, without deleting', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({version: 'v2', remote: []});
    const deps = makeDeps({
      folder,
      localAssets: [makeSyncedAsset('file:1:0', 'aaa')],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.missing).toEqual(1);
    expect(deps.updateAssetSourceMissing).toHaveBeenCalledWith(
      'asset-file:1:0',
      true
    );
  });

  it('de-dupes filename collisions deterministically', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({
      version: 'v1',
      remote: [
        {remoteId: 'file:2:0', filename: 'icon.png', contents: 'bbb'},
        {remoteId: 'file:1:0', filename: 'icon.png', contents: 'aaa'},
      ],
    });
    const deps = makeDeps({folder});
    await syncFolder({folder, provider, auth: AUTH, deps});

    const names = (deps.createAssetFile as any).mock.calls
      .map((call: any[]) => call[0].name)
      .sort();
    expect(names).toEqual(['icon (2).png', 'icon.png']);
    // Names are assigned in remoteId order, so 1:0 gets the plain name.
    const bySource = new Map(
      (deps.createAssetFile as any).mock.calls.map((call: any[]) => [
        call[0].source.remoteId,
        call[0].name,
      ])
    );
    expect(bySource.get('file:1:0')).toEqual('icon.png');
    expect(bySource.get('file:2:0')).toEqual('icon (2).png');
  });

  it('collects per-item failures without aborting, and does not advance lastRemoteVersion', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({
      version: 'v2',
      remote: [
        {remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'},
        {remoteId: 'file:2:0', filename: 'b.png', contents: 'bbb'},
      ],
    });
    const originalDownload = provider.download.bind(provider);
    provider.download = async (asset, source, auth) => {
      if (asset.remoteId === 'file:1:0') {
        throw new Error('render failed');
      }
      return originalDownload(asset, source, auth);
    };
    const deps = makeDeps({folder});
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.added).toEqual(1);
    expect(summary.failed).toEqual([
      {name: 'file:1:0', error: 'render failed'},
    ]);
    expect(deps.finalizeFolderSync).toHaveBeenCalledWith(
      'folder-icons',
      expect.objectContaining({ok: false, failed: 1}),
      {remoteVersion: undefined}
    );
  });

  it('aborts the download queue on a rate limit and rethrows', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({
      version: 'v1',
      remote: [
        {remoteId: 'file:1:0', filename: 'a.png', contents: 'aaa'},
        {remoteId: 'file:2:0', filename: 'b.png', contents: 'bbb'},
      ],
    });
    provider.download = async () => {
      throw new SyncRateLimitError('rate limited');
    };
    const deps = makeDeps({folder});
    await expect(
      syncFolder({folder, provider, auth: AUTH, deps, concurrency: 1})
    ).rejects.toThrow(SyncRateLimitError);
    // The first rate-limited item aborts the queue -- the remaining items
    // are not attempted (each would just be rate-limited again), and no
    // partial writes happen for them.
    expect(deps.createAssetFile).not.toHaveBeenCalled();
    expect(deps.finalizeFolderSync).toHaveBeenCalledWith(
      'folder-icons',
      expect.objectContaining({ok: false, error: 'rate limited'}),
      {remoteVersion: undefined}
    );
  });

  it('refuses to run while another sync holds a fresh lease', async () => {
    const folder = makeFolder({
      state: {status: 'syncing', startedAt: ts(), startedBy: 'b@example.com'},
    });
    const {provider} = makeProvider({version: 'v1', remote: []});
    const deps = makeDeps({folder});
    await expect(
      syncFolder({folder, provider, auth: AUTH, deps})
    ).rejects.toThrow(SyncInProgressError);
    expect(deps.setFolderSyncState).not.toHaveBeenCalled();

    // `force` overrides the lease; a stale lease is ignored automatically.
    const summary = await syncFolder({
      folder,
      provider,
      auth: AUTH,
      deps,
      force: true,
    });
    expect(summary.failed).toEqual([]);
  });

  it('ignores stale leases', async () => {
    const folder = makeFolder({
      state: {
        status: 'syncing',
        startedAt: ts(Date.now() - 60 * 60 * 1000),
        startedBy: 'b@example.com',
      },
    });
    const {provider} = makeProvider({version: 'v1', remote: []});
    const deps = makeDeps({folder});
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});
    expect(summary.failed).toEqual([]);
  });

  it('records enumeration errors on the folder and rethrows', async () => {
    const folder = makeFolder();
    const {provider} = makeProvider({version: 'v1', remote: []});
    provider.listRemoteAssets = async () => {
      throw new Error('no access');
    };
    const deps = makeDeps({folder});
    await expect(
      syncFolder({folder, provider, auth: AUTH, deps})
    ).rejects.toThrow('no access');
    expect(deps.finalizeFolderSync).toHaveBeenCalledWith(
      'folder-icons',
      expect.objectContaining({ok: false, error: 'no access'}),
      {remoteVersion: undefined}
    );
  });

  it('never imports hidden or OS junk files from the source', async () => {
    const folder = makeFolder();
    const {provider, downloaded} = makeProvider({
      version: 'v1',
      remote: [
        {
          remoteId: 'file:1',
          name: 'hero.png',
          filename: 'hero.png',
          contents: 'aaa',
        },
        {
          remoteId: 'file:2',
          name: '.DS_Store',
          filename: '.DS_Store',
          contents: 'junk',
        },
        {
          remoteId: 'file:3',
          name: 'Thumbs.db',
          filename: 'Thumbs.db',
          contents: 'junk',
        },
      ],
    });
    // A junk file imported before this rule existed is flagged missing on
    // the next sync (never auto-deleted), like any item gone at the source.
    const deps = makeDeps({
      folder,
      localAssets: [makeSyncedAsset('file:2', 'junk')],
    });
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.added).toEqual(1);
    expect(summary.missing).toEqual(1);
    expect(downloaded).toEqual(['file:1']);
    expect(deps.createAssetFile).toHaveBeenCalledTimes(1);
    expect((deps.createAssetFile as any).mock.calls[0][0].name).toEqual(
      'hero.png'
    );
    expect(deps.updateAssetSourceMissing).toHaveBeenCalledWith(
      'asset-file:2',
      true
    );
  });

  it('leaves manually uploaded files in the folder alone', async () => {
    const folder = makeFolder();
    const manualUpload = {
      id: 'manual1',
      type: 'file',
      parent: 'icons',
      name: 'manual.png',
      file: {src: 'https://gcs.example.com/manual.png'},
    } as AssetFile;
    const {provider} = makeProvider({version: 'v1', remote: []});
    const deps = makeDeps({folder, localAssets: [manualUpload]});
    const summary = await syncFolder({folder, provider, auth: AUTH, deps});

    expect(summary.missing).toEqual(0);
    expect(deps.updateAssetSourceMissing).not.toHaveBeenCalled();
  });
});
