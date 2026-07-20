/**
 * Tests for the publish/unpublish integration between content docs and the
 * v2 TranslationsManager, against the Firestore emulator (see
 * translations-manager.test.ts for details on the emulator setup).
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it} from 'vitest';
import {RootCMSClient} from './client.js';
import {TranslationsLocaleDoc} from './translations-manager.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'publish-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'publish-test');
}

let projectCounter = 0;

function createTestCmsClient(options?: {
  experiments?: Record<string, unknown>;
}): RootCMSClient {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `publish-test-${Date.now()}-${projectCounter++}`;
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
      experiments: options?.experiments ?? {v2TranslationsManager: true},
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

async function seedDraftDoc(cmsClient: RootCMSClient, docId: string) {
  const [collection, slug] = docId.split('/');
  await cmsClient.db
    .doc(
      `Projects/${cmsClient.projectId}/Collections/${collection}/Drafts/${slug}`
    )
    .set({
      id: docId,
      collection,
      slug,
      sys: {
        createdAt: Timestamp.now(),
        createdBy: 'test',
        modifiedAt: Timestamp.now(),
        modifiedBy: 'test',
        locales: ['en', 'es'],
      },
      fields: {title: `Title for ${docId}`},
    });
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'publishDocs() translations integration',
  () => {
    let cmsClient: RootCMSClient;

    beforeEach(() => {
      cmsClient = createTestCmsClient();
    });

    it('publishes a doc together with its translations', async () => {
      await seedDraftDoc(cmsClient, 'Pages/index');
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('Pages/index', {hello: {es: 'hola'}});

      await cmsClient.publishDocs(['Pages/index'], {
        publishedBy: 'test@example.com',
      });

      // The published doc exists.
      const publishedDoc = await cmsClient.db
        .doc(
          `Projects/${cmsClient.projectId}/Collections/Pages/Published/index`
        )
        .get();
      expect(publishedDoc.exists).toBe(true);

      // The published translations exist.
      const publishedTranslations = await tm.loadTranslations({
        ids: ['Pages/index'],
        mode: 'published',
      });
      expect(publishedTranslations.hello.es).toBe('hola');

      // The draft locale doc's sys records the publish.
      const draftLocaleDoc = await cmsClient.db
        .doc(
          `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/Pages--index:es`
        )
        .get();
      const draftData = draftLocaleDoc.data() as TranslationsLocaleDoc;
      expect(draftData.sys.publishedBy).toBe('test@example.com');
    });

    it('does not publish unrelated translations docs', async () => {
      await seedDraftDoc(cmsClient, 'Pages/index');
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('Pages/index', {hello: {es: 'hola'}});
      await tm.saveTranslations('common', {bye: {es: 'adios'}});

      await cmsClient.publishDocs(['Pages/index'], {
        publishedBy: 'test@example.com',
      });

      const published = await tm.loadTranslations({
        ids: ['common'],
        mode: 'published',
      });
      expect(published).toEqual({});
    });

    it('does not touch translations when the flag is disabled', async () => {
      const v1Client = createTestCmsClient({experiments: {}});
      await seedDraftDoc(v1Client, 'Pages/index');
      // Seed a draft translations locale doc directly (the manager API is
      // gated behind the flag).
      await v1Client.db
        .doc(
          `Projects/${v1Client.projectId}/TranslationsManager/draft/Translations/Pages--index:es`
        )
        .set({
          id: 'Pages/index',
          locale: 'es',
          tags: [],
          strings: {},
          sys: {modifiedAt: Timestamp.now(), modifiedBy: 'test'},
        });

      await v1Client.publishDocs(['Pages/index'], {
        publishedBy: 'test@example.com',
      });

      const publishedLocaleDoc = await v1Client.db
        .doc(
          `Projects/${v1Client.projectId}/TranslationsManager/published/Translations/Pages--index:es`
        )
        .get();
      expect(publishedLocaleDoc.exists).toBe(false);
    });

    it('unpublishDocs() removes published translations', async () => {
      await seedDraftDoc(cmsClient, 'Pages/index');
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('Pages/index', {hello: {es: 'hola'}});
      await cmsClient.publishDocs(['Pages/index'], {
        publishedBy: 'test@example.com',
      });

      await cmsClient.unpublishDocs(['Pages/index'], {
        unpublishedBy: 'test@example.com',
      });

      // The published locale docs are deleted.
      const published = await tm.loadTranslations({
        ids: ['Pages/index'],
        mode: 'published',
      });
      expect(published).toEqual({});

      // The draft locale doc's published metadata is cleared.
      const draftLocaleDoc = await cmsClient.db
        .doc(
          `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/Pages--index:es`
        )
        .get();
      const draftData = draftLocaleDoc.data() as TranslationsLocaleDoc;
      expect(draftData.sys.publishedAt).toBeUndefined();
      expect(draftData.sys.publishedBy).toBeUndefined();
      // The draft translations themselves remain.
      expect(draftData.id).toBe('Pages/index');
    });
  }
);
