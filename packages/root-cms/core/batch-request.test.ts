/**
 * Tests for BatchRequest/BatchResponse translation resolution against the
 * Firestore emulator (see translations-manager.test.ts for details on the
 * emulator setup).
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it} from 'vitest';
import {RootCMSClient} from './client.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'batch-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'batch-test');
}

let projectCounter = 0;

function createTestCmsClient(options?: {i18n?: any}): RootCMSClient {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `batch-test-${Date.now()}-${projectCounter++}`;
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
    i18n: options?.i18n ?? {
      locales: ['en', 'en-GB', 'en-CA', 'es'],
      fallbacks: {'en-CA': ['en-GB']},
    },
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
        locales: ['en'],
      },
      fields: {title: `Title for ${docId}`},
    });
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('BatchRequest', () => {
  let cmsClient: RootCMSClient;

  beforeEach(() => {
    cmsClient = createTestCmsClient();
  });

  it('fetches explicitly-added translations without translate', async () => {
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('common', {
      hello: {es: 'hola', 'en-GB': 'hello (GB)'},
    });

    const req = cmsClient.createBatchRequest({mode: 'draft'});
    req.addTranslations('common');
    const res = await req.fetch();

    expect(Object.keys(res.translations)).toEqual(['common']);
    expect(res.getTranslations('es')).toEqual({hello: 'hola'});
  });

  it('resolves locale fallbacks in getTranslations()', async () => {
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('common', {
      color: {'en-GB': 'colour'},
      untranslated: {es: 'es only'},
    });

    const req = cmsClient.createBatchRequest({mode: 'draft'});
    req.addTranslations('common');
    const res = await req.fetch();

    // en-CA falls back to en-GB (per i18n.fallbacks).
    expect(res.getTranslations('en-CA')).toEqual({
      color: 'colour',
      untranslated: 'untranslated',
    });
    // An explicit fallback chain can also be provided.
    expect(res.getTranslations(['en-CA', 'en-GB'])).toEqual({
      color: 'colour',
      untranslated: 'untranslated',
    });
    expect(res.getTranslations('es')).toEqual({
      color: 'color',
      untranslated: 'es only',
    });
  });

  it('auto-collects translations for docs when translate is enabled', async () => {
    await seedDraftDoc(cmsClient, 'Pages/index');
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('Pages/index', {hello: {es: 'hola (doc)'}});
    await tm.saveTranslations('common', {
      hello: {es: 'hola (common)'},
      bye: {es: 'adios'},
    });

    const req = cmsClient.createBatchRequest({mode: 'draft', translate: true});
    req.addDoc('Pages/index');
    req.addTranslations('common');
    const res = await req.fetch();

    expect(res.docs['Pages/index']).toBeDefined();
    // Generic translations come first, doc-specific translations last.
    expect(Object.keys(res.translations)).toEqual(['common', 'Pages/index']);
    // Doc-specific translations take precedence.
    expect(res.getTranslations('es')).toEqual({
      hello: 'hola (doc)',
      bye: 'adios',
    });
  });

  it('auto-collects translations for query results when translate is enabled', async () => {
    await seedDraftDoc(cmsClient, 'BlogPosts/foo');
    await seedDraftDoc(cmsClient, 'BlogPosts/bar');
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('BlogPosts/foo', {'foo title': {es: 'foo es'}});
    await tm.saveTranslations('BlogPosts/bar', {'bar title': {es: 'bar es'}});

    const req = cmsClient.createBatchRequest({mode: 'draft', translate: true});
    req.addQuery('blogPosts', 'BlogPosts');
    const res = await req.fetch();

    expect(res.queries.blogPosts).toHaveLength(2);
    expect(res.getTranslations('es')).toEqual({
      'foo title': 'foo es',
      'bar title': 'bar es',
    });
  });

  it('falls back to id queries when no locales are known', async () => {
    const client = createTestCmsClient({i18n: {}});
    const tm = client.getTranslationsManager();
    await tm.saveTranslations('common', {hello: {es: 'hola', fr: 'bonjour'}});

    const req = client.createBatchRequest({mode: 'draft'});
    req.addTranslations('common');
    const res = await req.fetch();

    expect(Object.keys(res.translations.common).sort()).toEqual(['es', 'fr']);
    expect(res.getTranslations(['fr'])).toEqual({hello: 'bonjour'});
  });

  it('limits fetched locales via options.locales', async () => {
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('common', {hello: {es: 'hola', 'en-GB': 'hi'}});

    const req = cmsClient.createBatchRequest({mode: 'draft', locales: ['es']});
    req.addTranslations('common');
    const res = await req.fetch();

    // Only the `es` fallback chain (es -> en) is fetched.
    expect(Object.keys(res.translations.common)).toEqual(['es']);
    expect(res.getTranslations('es')).toEqual({hello: 'hola'});
  });
});
