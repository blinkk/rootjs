// @vitest-environment node
/**
 * Integration test for release rollback snapshots recorded when a scheduled
 * release is published by the server (cron).
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  decodeReleaseRollbackSnapshot,
  testTimestampsEqual,
} from '../shared/release-rollback.js';
import {RootCMSClient} from './client.js';

const PROJECT_ID = 'scheduled-release-rollback-test';
const PREVIOUS_PUBLISHED_AT = Timestamp.fromMillis(1_700_000_000_000);

function createTestClient(db: Firestore): RootCMSClient {
  const client = Object.create(RootCMSClient.prototype);
  Object.assign(client, {
    projectId: PROJECT_ID,
    db,
    user: 'root-cms-client',
    logActions: true,
    cmsPlugin: {
      getConfig: () => ({
        experiments: {v2TranslationsManager: true},
        dependencyGraph: false,
      }),
    },
  });
  return client as RootCMSClient;
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'release rollback snapshots (scheduled releases)',
  () => {
    let app: App;
    let db: Firestore;

    beforeAll(() => {
      app = initializeApp({projectId: 'demo-release-rollback'}, 'rollback');
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    it('records the pre-release state of each item', async () => {
      const client = createTestClient(db);
      const project = `Projects/${PROJECT_ID}`;
      const sys = {
        createdAt: PREVIOUS_PUBLISHED_AT,
        createdBy: 'seed@example.com',
        modifiedAt: PREVIOUS_PUBLISHED_AT,
        modifiedBy: 'seed@example.com',
        publishedAt: PREVIOUS_PUBLISHED_AT,
        publishedBy: 'seed@example.com',
      };
      const page = {id: 'Pages/foo', collection: 'Pages', slug: 'foo'};
      await db.doc(`${project}/Collections/Pages/Drafts/foo`).set({
        ...page,
        sys,
        fields: {title: 'release'},
      });
      await db.doc(`${project}/Collections/Pages/Published/foo`).set({
        ...page,
        sys,
        fields: {title: 'before'},
      });
      await db.doc(`${project}/Collections/Pages/Drafts/bar`).set({
        id: 'Pages/bar',
        collection: 'Pages',
        slug: 'bar',
        sys: {
          createdAt: PREVIOUS_PUBLISHED_AT,
          createdBy: 'seed@example.com',
          modifiedAt: PREVIOUS_PUBLISHED_AT,
          modifiedBy: 'seed@example.com',
        },
        fields: {title: 'new'},
      });
      const translations = (translation: string) => ({
        id: 'Pages/foo',
        locale: 'de',
        strings: {abc: {source: 'Hello', translation}},
        sys: {
          modifiedAt: PREVIOUS_PUBLISHED_AT,
          modifiedBy: 'seed@example.com',
          publishedAt: PREVIOUS_PUBLISHED_AT,
          publishedBy: 'seed@example.com',
        },
      });
      await db
        .doc(`${project}/TranslationsManager/draft/Translations/Pages--foo:de`)
        .set(translations('Hallo (release)'));
      await db
        .doc(
          `${project}/TranslationsManager/published/Translations/Pages--foo:de`
        )
        .set(translations('Hallo (before)'));
      const dataSource = {
        id: 'products',
        type: 'http',
        url: 'https://example.com/data.json',
        dataFormat: 'map',
        publishedAt: PREVIOUS_PUBLISHED_AT,
        publishedBy: 'seed@example.com',
      };
      await db.doc(`${project}/DataSources/products`).set(dataSource);
      await db
        .doc(`${project}/DataSources/products/Data/draft`)
        .set({dataSource, data: {value: 'release'}});
      await db
        .doc(`${project}/DataSources/products/Data/published`)
        .set({dataSource, data: {value: 'before'}});
      const releaseRef = db.doc(`${project}/Releases/launch`);
      await releaseRef.set({
        id: 'launch',
        docIds: ['Pages/foo', 'Pages/bar'],
        dataSourceIds: ['products'],
        scheduledAt: Timestamp.fromMillis(Date.now() - 1000),
        scheduledBy: 'scheduler@example.com',
        rolledBackAt: PREVIOUS_PUBLISHED_AT,
        rolledBackBy: 'seed@example.com',
      });

      await client.publishScheduledReleases();

      const release = (await releaseRef.get()).data()!;
      expect(release.publishedAt).toBeDefined();
      expect(release.rolledBackAt).toBeUndefined();
      expect(release.rolledBackBy).toBeUndefined();

      const snapshots: Record<string, any> = {};
      (await releaseRef.collection('RollbackSnapshots').get()).docs.forEach(
        (doc) => {
          snapshots[doc.id] = decodeReleaseRollbackSnapshot(doc.data());
        }
      );
      expect(Object.keys(snapshots).sort()).toEqual([
        'dataSource:products',
        'doc:Pages--bar',
        'doc:Pages--foo',
        'translations:Pages--foo:de',
      ]);
      expect(snapshots['doc:Pages--foo'].previous.fields).toEqual({
        title: 'before',
      });
      expect(snapshots['doc:Pages--bar'].previous).toBeNull();
      expect(
        snapshots['translations:Pages--foo:de'].previous.strings.abc.translation
      ).toBe('Hallo (before)');
      expect(snapshots['dataSource:products'].previous.data).toEqual({
        value: 'before',
      });

      // Each snapshot's `releasedAt` matches the `publishedAt` written to the
      // item, which is how the UI detects changes made since the release.
      const published = async (path: string) =>
        (await db.doc(`${project}/${path}`).get()).data()!;
      const expectReleasedAt = (key: string, publishedAt: Timestamp) => {
        expect(
          testTimestampsEqual(snapshots[key].releasedAt, publishedAt)
        ).toBe(true);
      };
      expectReleasedAt(
        'doc:Pages--foo',
        (await published('Collections/Pages/Published/foo')).sys.publishedAt
      );
      expectReleasedAt(
        'doc:Pages--bar',
        (await published('Collections/Pages/Published/bar')).sys.publishedAt
      );
      expectReleasedAt(
        'translations:Pages--foo:de',
        (
          await published(
            'TranslationsManager/published/Translations/Pages--foo:de'
          )
        ).sys.publishedAt
      );
      expectReleasedAt(
        'dataSource:products',
        (await published('DataSources/products/Data/published')).dataSource
          .publishedAt
      );
    });
  }
);
