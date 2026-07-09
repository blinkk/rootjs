/**
 * Tests for the v1 -> v2 translations auto-migration, against the Firestore
 * emulator (see translations-manager.test.ts for details on the emulator
 * setup).
 */

import crypto from 'node:crypto';
import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it} from 'vitest';
import {RootCMSClient} from './client.js';
import {
  TranslationsMigrationState,
  migrateV1TranslationsIfNeeded,
} from './translations-migration.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'migration-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'migration-test');
}

let projectCounter = 0;

function createTestCmsClient(): RootCMSClient {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `migration-test-${Date.now()}-${projectCounter++}`;
  const plugin = {
    name: 'root-cms',
    getConfig: () => ({
      id: projectId,
      firebaseConfig: {
        apiKey: 'test',
        authDomain: 'test',
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: 'test',
      },
      experiments: {v2TranslationsManager: true},
    }),
    getFirebaseApp: () => app,
    getFirestore: () => db,
  };
  const rootConfig: any = {
    rootDir: '/test',
    i18n: {locales: ['en', 'es']},
    plugins: [plugin],
  };
  return new RootCMSClient(rootConfig);
}

function sha1(str: string) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

async function seedV1Translation(
  cmsClient: RootCMSClient,
  source: string,
  translations: Record<string, unknown>,
  tags?: string[]
) {
  const data: Record<string, unknown> = {...translations, source};
  if (tags) {
    data.tags = tags;
  }
  await cmsClient.db
    .doc(`Projects/${cmsClient.projectId}/Translations/${sha1(source)}`)
    .set(data);
}

function migrationStateRef(cmsClient: RootCMSClient) {
  return cmsClient.db.doc(
    `Projects/${cmsClient.projectId}/TranslationsManager/migration`
  );
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'migrateV1TranslationsIfNeeded',
  () => {
    let cmsClient: RootCMSClient;

    beforeEach(() => {
      cmsClient = createTestCmsClient();
    });

    it('migrates and publishes v1 translations', async () => {
      await seedV1Translation(cmsClient, 'hello', {es: 'hola'}, [
        'common',
        'Pages/index',
      ]);

      const res = await migrateV1TranslationsIfNeeded(cmsClient, {
        trigger: 'dev',
      });
      expect(res).toEqual({status: 'complete', skipped: false});

      // v1 translations were live, so the migrated data is published.
      const tm = cmsClient.getTranslationsManager();
      const published = await tm.loadTranslations({
        ids: ['common', 'Pages/index'],
        mode: 'published',
      });
      expect(published.hello.es).toBe('hola');

      // The migration state doc records completion.
      const state = (
        await migrationStateRef(cmsClient).get()
      ).data() as TranslationsMigrationState;
      expect(state.status).toBe('complete');
      expect(state.version).toBe(1);
      expect(state.stats).toEqual({numStrings: 1, numDocs: 2});

      // The v1 data is left untouched as a backup.
      const v1Doc = await cmsClient.db
        .doc(`Projects/${cmsClient.projectId}/Translations/${sha1('hello')}`)
        .get();
      expect(v1Doc.exists).toBe(true);
    });

    it('skips when the migration already completed', async () => {
      await seedV1Translation(cmsClient, 'hello', {es: 'hola'}, ['common']);
      const first = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(first.skipped).toBe(false);

      // Add a new v1 string; a second run should not import it.
      await seedV1Translation(cmsClient, 'bye', {es: 'adios'}, ['common']);
      const second = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(second).toEqual({status: 'complete', skipped: true});

      const tm = cmsClient.getTranslationsManager();
      const published = await tm.loadTranslations({
        ids: ['common'],
        mode: 'published',
      });
      expect(published.bye).toBeUndefined();
    });

    it('completes with empty stats when there is nothing to migrate', async () => {
      const res = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(res).toEqual({status: 'complete', skipped: false});
      const state = (
        await migrationStateRef(cmsClient).get()
      ).data() as TranslationsMigrationState;
      expect(state.stats).toEqual({numStrings: 0, numDocs: 0});
    });

    it('skips when another process holds a fresh running lock', async () => {
      await seedV1Translation(cmsClient, 'hello', {es: 'hola'}, ['common']);
      await migrationStateRef(cmsClient).set({
        version: 1,
        status: 'running',
        startedAt: Timestamp.now(),
        startedBy: 'other-process',
      });

      const res = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(res).toEqual({status: 'running', skipped: true});

      const tm = cmsClient.getTranslationsManager();
      const published = await tm.loadTranslations({
        ids: ['common'],
        mode: 'published',
      });
      expect(published).toEqual({});
    });

    it('takes over a stale running lock', async () => {
      await seedV1Translation(cmsClient, 'hello', {es: 'hola'}, ['common']);
      const staleMillis = Date.now() - 11 * 60 * 1000;
      await migrationStateRef(cmsClient).set({
        version: 1,
        status: 'running',
        startedAt: Timestamp.fromMillis(staleMillis),
        startedBy: 'crashed-process',
      });

      const res = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(res).toEqual({status: 'complete', skipped: false});

      const tm = cmsClient.getTranslationsManager();
      const published = await tm.loadTranslations({
        ids: ['common'],
        mode: 'published',
      });
      expect(published.hello.es).toBe('hola');
    });

    it('re-runs after a failed migration', async () => {
      await seedV1Translation(cmsClient, 'hello', {es: 'hola'}, ['common']);
      await migrationStateRef(cmsClient).set({
        version: 1,
        status: 'error',
        error: 'something went wrong',
        startedAt: Timestamp.now(),
      });

      const res = await migrateV1TranslationsIfNeeded(cmsClient);
      expect(res).toEqual({status: 'complete', skipped: false});
      const state = (
        await migrationStateRef(cmsClient).get()
      ).data() as TranslationsMigrationState;
      expect(state.status).toBe('complete');
      expect(state.error).toBeUndefined();
    });
  }
);
