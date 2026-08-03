// @vitest-environment node
/**
 * Integration test for csv-style data sources that use the `grid` data format.
 *
 * Firestore doesn't allow an array to be nested directly within another array,
 * so grid data (a `string[][]`) is stored as an array of `{cells: string[]}`
 * maps. These tests run the real `RootCMSClient` sync/publish flow against the
 * firestore emulator to verify grid data can be written, read back as a 2d
 * array, and published.
 *
 * Requires the firestore emulator (run via `firebase emulators:exec`).
 */

import {App, deleteApp, initializeApp} from 'firebase-admin/app';
import {Firestore, Timestamp, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {DataSource, RootCMSClient} from './client.js';

const GRID = [
  ['name', 'meal'],
  ['grogu', 'frog'],
  ['mando', 'soup'],
];

const STORED_GRID = [
  {cells: ['name', 'meal']},
  {cells: ['grogu', 'frog']},
  {cells: ['mando', 'soup']},
];

/**
 * Creates a `RootCMSClient` bound to the emulator db without requiring a full
 * root config / CMS plugin setup. The data source methods under test only use
 * `db`, `projectId` and the cms plugin config.
 */
function createTestClient(db: Firestore, projectId: string): RootCMSClient {
  const client = Object.create(RootCMSClient.prototype);
  Object.assign(client, {
    projectId,
    db,
    cmsPlugin: {getConfig: () => ({})},
  });
  return client as RootCMSClient;
}

/**
 * Seeds a data source doc and stubs the network fetch so that `syncDataSource()`
 * returns `data` without hitting the Google Sheets API.
 */
async function seedDataSource(
  db: Firestore,
  client: RootCMSClient,
  projectId: string,
  id: string,
  dataFormat: DataSource['dataFormat'],
  fetched: {data: any; headers?: string[]}
) {
  await db.doc(`Projects/${projectId}/DataSources/${id}`).set({
    id: id,
    type: 'gsheet',
    url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0',
    dataFormat: dataFormat,
    createdAt: Timestamp.now(),
    createdBy: 'seed@example.com',
  });
  (client as any).fetchData = async () => fetched;
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'data source grid format',
  () => {
    const projectId = 'datasource-grid-test';
    let app: App;
    let db: Firestore;

    beforeAll(() => {
      app = initializeApp(
        {projectId: 'demo-datasource-grid'},
        'datasource-grid'
      );
      db = getFirestore(app);
    });

    afterAll(async () => {
      await deleteApp(app);
    });

    it('firestore rejects arrays nested within arrays', async () => {
      const docRef = db.doc(
        `Projects/${projectId}/DataSources/nested/Data/draft`
      );
      let err: unknown = null;
      try {
        await docRef.set({data: GRID});
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
    });

    it('syncs grid data and reads it back as a 2d array', async () => {
      const id = 'grid-sync';
      const client = createTestClient(db, projectId);
      await seedDataSource(db, client, projectId, id, 'grid', {
        data: GRID,
        headers: GRID[0],
      });

      await client.syncDataSource(id, {syncedBy: 'tester@example.com'});

      // The stored doc must not contain arrays nested within arrays.
      const stored = await db
        .doc(`Projects/${projectId}/DataSources/${id}/Data/draft`)
        .get();
      expect(stored.data()!.data).toEqual(STORED_GRID);

      // Reads convert the stored data back into a 2d array of strings.
      const res = await client.getFromDataSource(id, {mode: 'draft'});
      expect(res!.data).toEqual(GRID);
      expect(res!.headers).toEqual(['name', 'meal']);
    });

    it('publishes grid data', async () => {
      const id = 'grid-publish';
      const client = createTestClient(db, projectId);
      await seedDataSource(db, client, projectId, id, 'grid', {
        data: GRID,
        headers: GRID[0],
      });

      await client.syncDataSource(id, {syncedBy: 'tester@example.com'});
      await client.publishDataSource(id, {publishedBy: 'tester@example.com'});

      const stored = await db
        .doc(`Projects/${projectId}/DataSources/${id}/Data/published`)
        .get();
      expect(stored.data()!.data).toEqual(STORED_GRID);

      const res = await client.getFromDataSource(id, {mode: 'published'});
      expect(res!.data).toEqual(GRID);
      expect(res!.headers).toEqual(['name', 'meal']);
    });

    it('publishes grid data as part of a release', async () => {
      const id = 'grid-release';
      const client = createTestClient(db, projectId);
      await seedDataSource(db, client, projectId, id, 'grid', {
        data: GRID,
        headers: GRID[0],
      });

      await client.syncDataSource(id, {syncedBy: 'tester@example.com'});
      await client.publishDataSources([id], {
        publishedBy: 'tester@example.com',
      });

      const res = await client.getFromDataSource(id, {mode: 'published'});
      expect(res!.data).toEqual(GRID);
    });

    it('leaves map data unchanged', async () => {
      const id = 'map-sync';
      const client = createTestClient(db, projectId);
      const mapData = [
        {name: 'grogu', meal: 'frog'},
        {name: 'mando', meal: 'soup'},
      ];
      await seedDataSource(db, client, projectId, id, 'map', {
        data: mapData,
        headers: ['name', 'meal'],
      });

      await client.syncDataSource(id, {syncedBy: 'tester@example.com'});

      const stored = await db
        .doc(`Projects/${projectId}/DataSources/${id}/Data/draft`)
        .get();
      expect(stored.data()!.data).toEqual(mapData);

      const res = await client.getFromDataSource(id, {mode: 'draft'});
      expect(res!.data).toEqual(mapData);
    });
  }
);
