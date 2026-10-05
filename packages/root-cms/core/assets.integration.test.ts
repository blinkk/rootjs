// @vitest-environment node
/**
 * Integration tests for the server-side asset library (`core/assets.ts`).
 *
 * Runs the real `RootCMSClient` asset methods against the firestore emulator,
 * with GCS and the GCI service stubbed out, to verify that uploads create
 * asset docs, replacements fan out to every draft doc that embeds the asset,
 * and docs copied through the client stay linked to their assets.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, getFirestore} from 'firebase-admin/firestore';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {parseProposal} from '../shared/proposal.js';
import {RootCMSClient, unmarshalData} from './client.js';
import {applyProposal} from './proposal-apply.js';

const storageMocks = vi.hoisted(() => {
  const saved: Array<{bucket: string; path: string; data: Buffer; opts: any}> =
    [];
  return {
    saved,
    getStorage: () => ({
      bucket: (bucket: string) => ({
        file: (path: string) => ({
          save: async (data: Buffer, opts: any) => {
            saved.push({bucket, path, data, opts});
          },
        }),
      }),
    }),
  };
});

vi.mock('firebase-admin/storage', () => ({
  getStorage: storageMocks.getStorage,
}));

const BUCKET = 'test-bucket';

/** Builds the header of a PNG file with the given dimensions. */
function pngBytes(width: number, height: number, seed = 0): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  // Vary the trailing bytes so different "images" hash differently.
  buf.writeUInt32BE(seed, 29);
  return buf;
}

/**
 * Creates a `RootCMSClient` bound to the emulator db without requiring a full
 * root config / CMS plugin setup.
 */
function createTestClient(
  db: Firestore,
  projectId: string,
  cmsConfig: Record<string, any>
): RootCMSClient {
  const client = Object.create(RootCMSClient.prototype);
  Object.assign(client, {
    projectId,
    db,
    app: {},
    user: 'root-cms-client',
    cmsPlugin: {
      getConfig: () => ({
        firebaseConfig: {storageBucket: BUCKET},
        ...cmsConfig,
      }),
    },
  });
  return client as RootCMSClient;
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'RootCMSClient asset library',
  () => {
    let app: App;
    let db: Firestore;
    let testIndex = 0;
    let projectId: string;
    let client: RootCMSClient;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeAll(() => {
      app = initializeApp({projectId: 'demo-assets'}, 'assets-test');
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    beforeEach(() => {
      testIndex += 1;
      projectId = `assets-test-${Date.now()}-${testIndex}`;
      client = createTestClient(db, projectId, {gci: true});
      storageMocks.saved.length = 0;
      fetchMock = vi.fn(async (url: string) => {
        const gcsPath = new URL(url).searchParams.get('gcs');
        return new Response(
          JSON.stringify({
            servingUrl: `https://lh3.googleusercontent.com/${encodeURIComponent(gcsPath!)}`,
          }),
          {status: 200}
        );
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function draftPath(docId: string) {
      const [collectionId, slug] = docId.split('/');
      return `Projects/${projectId}/Collections/${collectionId}/Drafts/${slug}`;
    }

    async function getDraft(docId: string) {
      const snapshot = await db.doc(draftPath(docId)).get();
      return snapshot.data()!;
    }

    it('uploads a new file into a folder', async () => {
      const res = await client.uploadAsset(pngBytes(640, 480), {
        filename: 'hero.png',
        folder: 'marketing/q1',
        alt: 'Hero image',
        modifiedBy: 'cli@example.com',
      });

      expect(res.status).toBe('created');
      expect(res.sync).toBeUndefined();
      const asset = res.asset;
      expect(asset).toMatchObject({
        type: 'file',
        parent: 'marketing/q1',
        name: 'hero.png',
        createdBy: 'cli@example.com',
      });
      expect(asset.id).toMatch(/^[A-Za-z0-9]{12}$/);

      // The file is uploaded to `{projectId}/uploads/{sha1}.{ext}`.
      expect(storageMocks.saved).toHaveLength(1);
      const saved = storageMocks.saved[0];
      expect(saved.bucket).toBe(BUCKET);
      expect(saved.path).toMatch(
        new RegExp(`^${projectId}/uploads/[0-9a-f]{40}\\.png$`)
      );
      expect(saved.opts.contentType).toBe('image/png');
      expect(saved.opts.metadata.cacheControl).toBe('public, max-age=31536000');

      // Images are registered with the GCI service.
      const gcsPath = `/${BUCKET}/${saved.path}`;
      expect(fetchMock).toHaveBeenCalledWith(
        `https://services.rootjs.dev/_/serving_url?${new URLSearchParams({gcs: gcsPath})}`
      );
      expect(asset.file).toMatchObject({
        src: `https://lh3.googleusercontent.com/${encodeURIComponent(gcsPath)}`,
        gcsPath: gcsPath,
        filename: 'hero.png',
        width: 640,
        height: 480,
        alt: 'Hero image',
        uploadedBy: 'cli@example.com',
      });

      // The asset and its folders are stored in the db.
      expect(await client.getAsset(asset.id)).toMatchObject({
        id: asset.id,
        name: 'hero.png',
      });
      const rootListing = await client.listAssets();
      expect(rootListing.map((a) => [a.type, a.name])).toEqual([
        ['folder', 'marketing'],
      ]);
      const listing = await client.listAssets('marketing/q1');
      expect(listing.map((a) => a.id)).toEqual([asset.id]);
    });

    it('uses the gcs url for non-gci files', async () => {
      const res = await client.uploadAsset(Buffer.from('%PDF-1.4'), {
        filename: 'guide.pdf',
      });
      const saved = storageMocks.saved[0];
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saved.opts.contentType).toBe('application/pdf');
      expect(res.asset.file).toMatchObject({
        src: `https://storage.googleapis.com/${BUCKET}/${saved.path}`,
        filename: 'guide.pdf',
      });
      expect(res.asset.file?.gcsPath).toBeUndefined();
      expect(res.asset.file?.width).toBeUndefined();
    });

    it('records video dimensions', async () => {
      // A minimal WebM with a single 1280x720 video track.
      const webm = Buffer.from(
        [
          '1a45dfa3 87 4282 84 7765626d',
          '18538067 94',
          '1654ae6b 8f',
          'ae 8d 83 81 01',
          'e0 88 b0 82 0500 ba 82 02d0',
        ]
          .join('')
          .replace(/\s/g, ''),
        'hex'
      );
      const res = await client.uploadAsset(webm, {filename: 'intro.webm'});
      const saved = storageMocks.saved[0];
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saved.opts.contentType).toBe('video/webm');
      expect(saved.opts.metadata.metadata).toMatchObject({
        width: '1280',
        height: '720',
      });
      expect(res.asset.file).toMatchObject({
        src: `https://storage.googleapis.com/${BUCKET}/${saved.path}`,
        width: 1280,
        height: 720,
      });
    });

    it('preserves the filename in folders with preserveFilename', async () => {
      await db.doc(`Projects/${projectId}/Assets/folder-brand`).set({
        id: 'folder-brand',
        type: 'folder',
        parent: '',
        name: 'brand',
        preserveFilename: true,
      });
      await client.uploadAsset(pngBytes(10, 10), {
        filename: 'logo.png',
        folder: 'brand/icons',
        disableGci: true,
      });
      expect(storageMocks.saved[0].path).toMatch(
        new RegExp(`^${projectId}/uploads/[0-9a-f]{40}/logo\\.png$`)
      );
    });

    it('replaces an existing file and fans out to docs using it', async () => {
      const {asset} = await client.uploadAsset(pngBytes(100, 50), {
        filename: 'hero.png',
        folder: 'marketing',
        alt: 'Original alt',
      });
      const originalFile = asset.file!;

      // Doc A embeds the asset twice (once nested in a marshaled array), with
      // a doc-level alt override on the nested copy.
      await client.saveDraftData('Pages/a', {
        hero: {image: {...originalFile, assetId: asset.id}},
        modules: [
          {image: {...originalFile, alt: 'Custom alt', assetId: asset.id}},
        ],
      });
      // Doc B embeds the asset in a different collection.
      await client.saveDraftData('BlogPosts/b', {
        image: {...originalFile, assetId: asset.id},
      });
      // Doc C uses the same file without linking to the asset.
      await client.saveDraftData('Pages/c', {image: {...originalFile}});

      expect(await client.findDocsUsingAsset(asset.id)).toEqual([
        'BlogPosts/b',
        'Pages/a',
      ]);

      // Re-uploading a file with the same name into the same folder replaces
      // the asset in place.
      const res = await client.uploadAsset(pngBytes(200, 100, 1), {
        filename: 'hero.png',
        folder: 'marketing',
        modifiedBy: 'cli@example.com',
      });
      expect(res.status).toBe('replaced');
      expect(res.asset.id).toBe(asset.id);
      expect(res.sync).toEqual({
        updatedDocIds: ['BlogPosts/b', 'Pages/a'],
        failedDocIds: [],
      });
      const newFile = res.asset.file!;
      expect(newFile.src).not.toBe(originalFile.src);
      expect(newFile).toMatchObject({width: 200, height: 100});
      // The alt text is kept when the new upload doesn't define one.
      expect(newFile.alt).toBe('Original alt');
      expect(await client.listAssets('marketing')).toHaveLength(1);

      const docA = unmarshalData(await getDraft('Pages/a'));
      expect(docA.fields.hero.image).toEqual({...newFile, assetId: asset.id});
      expect(docA.fields.modules[0].image).toEqual({
        ...newFile,
        alt: 'Custom alt',
        assetId: asset.id,
      });
      expect(docA.sys.modifiedBy).toBe('cli@example.com');
      const docB = unmarshalData(await getDraft('BlogPosts/b'));
      expect(docB.fields.image).toEqual({...newFile, assetId: asset.id});
      const docC = unmarshalData(await getDraft('Pages/c'));
      expect(docC.fields.image.src).toBe(originalFile.src);
    });

    it('replaces an asset by id and updates its extension', async () => {
      const {asset} = await client.uploadAsset(pngBytes(10, 10), {
        filename: 'hero.png',
        folder: 'marketing',
      });
      await client.saveDraftData('Pages/a', {
        image: {...asset.file, assetId: asset.id},
      });

      const res = await client.uploadAsset(Buffer.from('<svg></svg>'), {
        filename: 'new-hero.svg',
        assetId: asset.id,
        folder: 'ignored',
      });
      expect(res.status).toBe('replaced');
      expect(res.asset).toMatchObject({
        id: asset.id,
        parent: 'marketing',
        name: 'hero.svg',
      });
      expect((await client.getAsset(asset.id))?.name).toBe('hero.svg');
      expect(res.sync?.updatedDocIds).toEqual(['Pages/a']);
      const doc = unmarshalData(await getDraft('Pages/a'));
      expect(doc.fields.image.filename).toBe('new-hero.svg');
    });

    it('skips the doc fan-out when syncDocs is false', async () => {
      const {asset} = await client.uploadAsset(pngBytes(10, 10), {
        filename: 'hero.png',
      });
      await client.saveDraftData('Pages/a', {
        image: {...asset.file, assetId: asset.id},
      });
      const res = await client.uploadAsset(pngBytes(20, 20, 1), {
        filename: 'hero.png',
        syncDocs: false,
      });
      expect(res.sync).toBeUndefined();
      const doc = unmarshalData(await getDraft('Pages/a'));
      expect(doc.fields.image.src).toBe(asset.file!.src);

      // The fan-out can be run separately.
      const syncRes = await client.syncAssetToDocs(asset.id);
      expect(syncRes.updatedDocIds).toEqual(['Pages/a']);
      const synced = unmarshalData(await getDraft('Pages/a'));
      expect(synced.fields.image.src).toBe(res.asset.file!.src);
    });

    it('rejects uploads with invalid names or missing assets', async () => {
      await expect(
        client.uploadAsset(pngBytes(1, 1), {filename: 'a/b.png'})
      ).rejects.toThrow('Name cannot contain slashes.');
      await expect(client.uploadAsset(pngBytes(1, 1))).rejects.toThrow(
        'options.filename is required'
      );
      await expect(
        client.uploadAsset(pngBytes(1, 1), {
          filename: 'a.png',
          assetId: 'missing',
        })
      ).rejects.toThrow('asset not found: missing');
    });

    describe('copied docs', () => {
      async function seedAssetAndDoc() {
        const {asset} = await client.uploadAsset(pngBytes(10, 10), {
          filename: 'hero.png',
        });
        await client.saveDraftData('Pages/source', {
          hero: {image: {...asset.file, assetId: asset.id}},
        });
        return asset;
      }

      it('indexes asset links when a doc is copied with saveDraftData()', async () => {
        const asset = await seedAssetAndDoc();
        const source = await client.getDoc('Pages', 'source', {mode: 'draft'});
        await client.saveDraftData('Pages/copy', source!.fields);

        const copy = await getDraft('Pages/copy');
        expect(copy.sys.assets).toEqual([asset.id]);

        const res = await client.uploadAsset(pngBytes(20, 20, 1), {
          filename: 'hero.png',
        });
        expect(res.sync?.updatedDocIds).toEqual(['Pages/copy', 'Pages/source']);
        const synced = unmarshalData(await getDraft('Pages/copy'));
        expect(synced.fields.hero.image.src).toBe(res.asset.file!.src);
      });

      it('indexes asset links when a doc is copied with setRawDoc()', async () => {
        const asset = await seedAssetAndDoc();
        const raw = await client.getRawDoc('Pages', 'source', {mode: 'draft'});
        // Simulate a raw copy that drops the source doc's index.
        delete raw.sys.assets;
        await client.setRawDoc('Pages', 'copy', raw, {mode: 'draft'});
        const copy = await getDraft('Pages/copy');
        expect(copy.sys.assets).toEqual([asset.id]);
      });

      it('indexes asset links when a proposal duplicates a doc', async () => {
        const asset = await seedAssetAndDoc();
        const parsed = parseProposal(
          [
            'version: 1',
            'id: dup',
            'changes:',
            '  - kind: doc.duplicate',
            '    fromDocId: Pages/source',
            '    toDocId: Pages/dup',
          ].join('\n')
        );
        if (!parsed.ok) {
          throw new Error(JSON.stringify(parsed.errors));
        }
        const result = await applyProposal(client, parsed.proposal, {
          skipValidation: true,
        });
        expect(result.ok).toBe(true);
        const dup = await getDraft('Pages/dup');
        expect(dup.sys.assets).toEqual([asset.id]);
        expect(await client.findDocsUsingAsset(asset.id)).toEqual([
          'Pages/dup',
          'Pages/source',
        ]);
      });

      it('clears the index when asset links are removed', async () => {
        await seedAssetAndDoc();
        await client.saveDraftData('Pages/source', {hero: {title: 'No image'}});
        const doc = await getDraft('Pages/source');
        expect(doc.sys.assets).toBeUndefined();
      });
    });
  }
);
