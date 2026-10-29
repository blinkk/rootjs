// @vitest-environment node
/**
 * Integration tests for release rollbacks, running the real `publishRelease()`
 * and `rollbackRelease()` flows against the firestore emulator.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */
import {deleteApp, FirebaseApp, initializeApp} from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDoc,
  getDocs,
  getFirestore,
  collection,
  deleteDoc,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../logs/actions.js', () => ({
  logAction: vi.fn(async () => {}),
}));

import {cmsPublishDocs} from '../documents/doc.js';
import {getReleaseRollbackPlan} from './release-rollback.js';
import {publishRelease, rollbackRelease} from './release.js';

const PROJECT_ID = 'demo-release-rollback';
const PREVIOUS_PUBLISHED_AT = Timestamp.fromMillis(1_700_000_000_000);

function setUser(email: string) {
  (globalThis as any).window.firebase.user = {email};
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'release rollbacks (firestore emulator)',
  () => {
    let app: FirebaseApp;
    let db: Firestore;
    let counter = 0;

    beforeAll(() => {
      const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(
        ':'
      );
      app = initializeApp({projectId: PROJECT_ID}, 'release-rollback-test');
      db = getFirestore(app);
      connectFirestoreEmulator(db, host || 'localhost', Number(port) || 8080);
      (globalThis as any).window = {
        firebase: {db, user: {email: 'alice@example.com'}},
        __ROOT_CTX: {
          rootConfig: {projectId: PROJECT_ID},
          experiments: {v2TranslationsManager: true},
        },
      };
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    // Each test uses its own docs, data source and release, so the emulator
    // needs no clearing.
    let releaseId = '';
    let existingDocId = '';
    let newDocId = '';
    let dataSourceId = '';
    beforeEach(async () => {
      counter += 1;
      releaseId = `release-${counter}`;
      existingDocId = `Pages/existing-${counter}`;
      newDocId = `Pages/new-${counter}`;
      dataSourceId = `ds-${counter}`;
      setUser('alice@example.com');
      await seed();
    });

    function docPath(mode: 'Drafts' | 'Published', docId: string) {
      const [collectionId, slug] = docId.split('/');
      return [
        'Projects',
        PROJECT_ID,
        'Collections',
        collectionId,
        mode,
        slug,
      ] as const;
    }

    function translationsPath(mode: 'draft' | 'published', docId: string) {
      const key = `${docId.replace('/', '--')}:de`;
      return [
        'Projects',
        PROJECT_ID,
        'TranslationsManager',
        mode,
        'Translations',
        key,
      ] as const;
    }

    function dataSourcePath(...segments: string[]) {
      return ['Projects', PROJECT_ID, 'DataSources', dataSourceId, ...segments];
    }

    async function read(path: readonly string[]) {
      const [first, ...rest] = path;
      const snapshot = await getDoc(doc(db, first, ...rest));
      return snapshot.exists() ? snapshot.data() : null;
    }

    async function seed() {
      const sys = {
        createdAt: PREVIOUS_PUBLISHED_AT,
        createdBy: 'seed@example.com',
        modifiedAt: PREVIOUS_PUBLISHED_AT,
        modifiedBy: 'seed@example.com',
      };
      const publishedSys = {
        ...sys,
        firstPublishedAt: PREVIOUS_PUBLISHED_AT,
        firstPublishedBy: 'seed@example.com',
        publishedAt: PREVIOUS_PUBLISHED_AT,
        publishedBy: 'seed@example.com',
      };
      const [collectionId, existingSlug] = existingDocId.split('/');
      const existing = {
        id: existingDocId,
        collection: collectionId,
        slug: existingSlug,
      };
      await setDoc(doc(db, ...docPath('Drafts', existingDocId)), {
        ...existing,
        sys: publishedSys,
        fields: {title: 'release'},
      });
      await setDoc(doc(db, ...docPath('Published', existingDocId)), {
        ...existing,
        sys: publishedSys,
        fields: {title: 'before'},
      });
      await setDoc(doc(db, ...docPath('Drafts', newDocId)), {
        id: newDocId,
        collection: collectionId,
        slug: newDocId.split('/')[1],
        sys,
        fields: {title: 'new'},
      });

      const translations = (translation: string, published: boolean) => ({
        id: existingDocId,
        locale: 'de',
        strings: {abc: {source: 'Hello', translation}},
        sys: {
          modifiedAt: PREVIOUS_PUBLISHED_AT,
          modifiedBy: 'seed@example.com',
          ...(published
            ? {
                publishedAt: PREVIOUS_PUBLISHED_AT,
                publishedBy: 'seed@example.com',
              }
            : {}),
        },
      });
      await setDoc(
        doc(db, ...translationsPath('draft', existingDocId)),
        translations('Hallo (release)', true)
      );
      await setDoc(
        doc(db, ...translationsPath('published', existingDocId)),
        translations('Hallo (before)', true)
      );

      const dataSource = {
        id: dataSourceId,
        type: 'http',
        url: 'https://example.com/data.json',
        dataFormat: 'map',
        publishedAt: PREVIOUS_PUBLISHED_AT,
        publishedBy: 'seed@example.com',
      };
      const [ds, ...dsPath] = dataSourcePath();
      await setDoc(doc(db, ds, ...dsPath), dataSource);
      await setDoc(doc(db, ds, ...dsPath, 'Data', 'draft'), {
        dataSource,
        data: {value: 'release'},
      });
      await setDoc(doc(db, ds, ...dsPath, 'Data', 'published'), {
        dataSource,
        data: {value: 'before'},
      });

      await setDoc(doc(db, 'Projects', PROJECT_ID, 'Releases', releaseId), {
        id: releaseId,
        docIds: [existingDocId, newDocId],
        dataSourceIds: [dataSourceId],
      });
    }

    async function listSnapshotKeys() {
      const res = await getDocs(
        collection(
          db,
          'Projects',
          PROJECT_ID,
          'Releases',
          releaseId,
          'RollbackSnapshots'
        )
      );
      return res.docs.map((d) => d.id).sort();
    }

    async function expectRestored() {
      const published = await read(docPath('Published', existingDocId));
      expect(published?.fields).toEqual({title: 'before'});
      const draft = await read(docPath('Drafts', existingDocId));
      expect(draft?.fields).toEqual({title: 'release'});
      expect(draft?.sys.publishedAt).toEqual(PREVIOUS_PUBLISHED_AT);
      expect(draft?.sys.modifiedBy).toBe('alice@example.com');

      // The new doc wasn't published before the release, so it's unpublished.
      expect(await read(docPath('Published', newDocId))).toBeNull();
      const newDraft = await read(docPath('Drafts', newDocId));
      expect(newDraft?.fields).toEqual({title: 'new'});
      expect(newDraft?.sys.publishedAt).toBeUndefined();
      expect(newDraft?.sys.firstPublishedAt).toBeUndefined();

      const translations = await read(
        translationsPath('published', existingDocId)
      );
      expect(translations?.strings.abc.translation).toBe('Hallo (before)');

      const dataSourceData = await read(dataSourcePath('Data', 'published'));
      expect(dataSourceData?.data).toEqual({value: 'before'});
      const dataSource = await read(dataSourcePath());
      expect(dataSource?.publishedAt).toEqual(PREVIOUS_PUBLISHED_AT);

      const release = await read([
        'Projects',
        PROJECT_ID,
        'Releases',
        releaseId,
      ]);
      expect(release?.publishedAt).toBeUndefined();
      expect(release?.rolledBackAt).toBeInstanceOf(Timestamp);
      expect(release?.rolledBackBy).toBe('alice@example.com');
      expect(await listSnapshotKeys()).toEqual([]);
    }

    it('records snapshots when publishing and restores them on rollback', async () => {
      await publishRelease(releaseId);

      const published = await read(docPath('Published', existingDocId));
      expect(published?.fields).toEqual({title: 'release'});
      expect(await listSnapshotKeys()).toEqual(
        [
          `dataSource:${dataSourceId}`,
          `doc:${existingDocId.replace('/', '--')}`,
          `doc:${newDocId.replace('/', '--')}`,
          `translations:${existingDocId.replace('/', '--')}:de`,
        ].sort()
      );

      const plan = await getReleaseRollbackPlan(releaseId);
      expect(plan.items).toHaveLength(4);
      expect(plan.conflicts).toEqual([]);

      await rollbackRelease(releaseId);
      await expectRestored();
    });

    it('detects items published since the release and requires force', async () => {
      await publishRelease(releaseId);

      // Someone else publishes a change to one of the release's docs.
      setUser('bob@example.com');
      await updateDoc(doc(db, ...docPath('Drafts', existingDocId)), {
        'fields.title': 'hotfix',
      });
      await cmsPublishDocs([existingDocId]);
      setUser('alice@example.com');

      const plan = await getReleaseRollbackPlan(releaseId);
      expect(plan.conflicts).toHaveLength(2);
      const docConflict = plan.conflicts.find((c) => c.type === 'doc')!;
      expect(docConflict).toMatchObject({
        id: existingDocId,
        reason: 'published',
        publishedBy: 'bob@example.com',
      });
      // The doc's translations were re-published along with the doc.
      expect(
        plan.conflicts.find((c) => c.type === 'translations')
      ).toMatchObject({id: existingDocId, locale: 'de', reason: 'published'});

      await expect(rollbackRelease(releaseId)).rejects.toThrow(
        /2 item\(s\) changed since the release was published/
      );
      // Nothing was rolled back.
      const published = await read(docPath('Published', existingDocId));
      expect(published?.fields).toEqual({title: 'hotfix'});

      await rollbackRelease(releaseId, {force: true});
      const restored = await read(docPath('Published', existingDocId));
      expect(restored?.fields).toEqual({title: 'before'});
      const draft = await read(docPath('Drafts', existingDocId));
      expect(draft?.fields).toEqual({title: 'hotfix'});
    });

    it('detects items unpublished since the release', async () => {
      await publishRelease(releaseId);
      const [ds, ...dsPath] = dataSourcePath('Data', 'published');
      await deleteDoc(doc(db, ds, ...dsPath));

      const plan = await getReleaseRollbackPlan(releaseId);
      expect(plan.conflicts).toEqual([
        {type: 'dataSource', id: dataSourceId, reason: 'unpublished'},
      ]);
    });

    it('keeps the original pre-release state when a release is re-published', async () => {
      await publishRelease(releaseId);
      await updateDoc(doc(db, ...docPath('Drafts', existingDocId)), {
        'fields.title': 'release v2',
      });
      await publishRelease(releaseId);
      const published = await read(docPath('Published', existingDocId));
      expect(published?.fields).toEqual({title: 'release v2'});

      expect((await getReleaseRollbackPlan(releaseId)).conflicts).toEqual([]);
      await rollbackRelease(releaseId);
      const restored = await read(docPath('Published', existingDocId));
      expect(restored?.fields).toEqual({title: 'before'});
    });

    it('skips docs deleted since the release', async () => {
      await publishRelease(releaseId);
      await deleteDoc(doc(db, ...docPath('Drafts', newDocId)));
      await deleteDoc(doc(db, ...docPath('Published', newDocId)));

      const plan = await getReleaseRollbackPlan(releaseId);
      expect(plan.conflicts).toEqual([]);
      await rollbackRelease(releaseId);
      expect(await read(docPath('Drafts', newDocId))).toBeNull();
      expect(await read(docPath('Published', newDocId))).toBeNull();
      const restored = await read(docPath('Published', existingDocId));
      expect(restored?.fields).toEqual({title: 'before'});
    });

    it('can re-publish a rolled back release', async () => {
      await publishRelease(releaseId);
      await rollbackRelease(releaseId);
      await publishRelease(releaseId);

      const published = await read(docPath('Published', existingDocId));
      expect(published?.fields).toEqual({title: 'release'});
      const release = await read([
        'Projects',
        PROJECT_ID,
        'Releases',
        releaseId,
      ]);
      expect(release?.publishedAt).toBeInstanceOf(Timestamp);
      expect(release?.rolledBackAt).toBeUndefined();

      await rollbackRelease(releaseId);
      await expectRestored();
    });

    it('cannot roll back a release without rollback data', async () => {
      await updateDoc(doc(db, 'Projects', PROJECT_ID, 'Releases', releaseId), {
        publishedAt: PREVIOUS_PUBLISHED_AT,
      });
      await expect(rollbackRelease(releaseId)).rejects.toThrow(
        /no rollback data/
      );
    });
  }
);
