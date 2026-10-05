/**
 * Tests for the v2 TranslationsManager. These tests run against the Firestore
 * emulator (the package's test script runs vitest under
 * `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST so the admin
 * SDK auto-connects to the emulator).
 */

import crypto from 'node:crypto';
import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it} from 'vitest';
import {hashStr} from '../shared/strings.js';
import {RootCMSClient} from './client.js';
import {
  TranslationsLocaleDoc,
  translationsForLocaleV2,
} from './translations-manager.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'tm-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'tm-test');
}

let projectCounter = 0;

/**
 * Creates a RootCMSClient backed by the Firestore emulator. Each call uses a
 * unique CMS project id so tests are isolated from each other.
 */
function createTestCmsClient(options?: {
  i18n?: any;
  experiments?: Record<string, unknown>;
}): RootCMSClient {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `test-project-${Date.now()}-${projectCounter++}`;
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
    i18n: options?.i18n ?? {locales: ['en', 'es', 'fr']},
    plugins: [plugin],
  };
  return new RootCMSClient(rootConfig);
}

function sha1(str: string) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'TranslationsManager',
  () => {
    let cmsClient: RootCMSClient;

    beforeEach(() => {
      cmsClient = createTestCmsClient();
    });

    it('getTranslationsManager() throws when the flag is disabled', () => {
      const disabledClient = createTestCmsClient({
        experiments: {v2TranslationsManager: false},
      });
      expect(() => disabledClient.getTranslationsManager()).toThrowError(
        /v2TranslationsManager/
      );
      expect(disabledClient.isV2TranslationsEnabled()).toBe(false);
      expect(cmsClient.isV2TranslationsEnabled()).toBe(true);
    });

    it('is enabled by default when the flag is unset', () => {
      const defaultClient = createTestCmsClient({experiments: {}});
      expect(defaultClient.isV2TranslationsEnabled()).toBe(true);
    });

    it('saves draft translations as per-locale docs', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations(
        'Pages/index',
        {
          one: {es: 'uno', fr: 'un'},
          two: {es: 'dos'},
        },
        {tags: ['Pages/index']}
      );

      const dbPath = `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations`;
      // Slashes in the translations id are normalized to `--` in doc keys.
      const esDoc = await cmsClient.db.doc(`${dbPath}/Pages--index:es`).get();
      expect(esDoc.exists).toBe(true);
      const esData = esDoc.data() as TranslationsLocaleDoc;
      expect(esData.id).toBe('Pages/index');
      expect(esData.locale).toBe('es');
      expect(esData.tags).toEqual(['Pages/index']);
      expect(esData.strings[hashStr('one')]).toEqual({
        source: 'one',
        translation: 'uno',
      });
      expect(esData.strings[hashStr('two')]).toEqual({
        source: 'two',
        translation: 'dos',
      });
      expect(esData.sys.modifiedAt).toBeDefined();

      const frDoc = await cmsClient.db.doc(`${dbPath}/Pages--index:fr`).get();
      expect(frDoc.exists).toBe(true);
      expect((frDoc.data() as TranslationsLocaleDoc).strings).toEqual({
        [hashStr('one')]: {source: 'one', translation: 'un'},
      });
    });

    it('loads draft translations by id', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('common', {hello: {es: 'hola'}});
      const strings = await tm.loadTranslations({
        ids: ['common'],
        mode: 'draft',
      });
      expect(strings).toEqual({hello: {source: 'hello', es: 'hola'}});
    });

    it('chunks `in` queries when loading more than 10 ids', async () => {
      const tm = cmsClient.getTranslationsManager();
      const ids: string[] = [];
      for (let i = 0; i < 12; i++) {
        const id = `Pages/page-${i}`;
        ids.push(id);
        await tm.saveTranslations(id, {[`string ${i}`]: {es: `cadena ${i}`}});
      }
      const strings = await tm.loadTranslations({ids, mode: 'draft'});
      expect(Object.keys(strings)).toHaveLength(12);
      expect(strings['string 11'].es).toBe('cadena 11');
    });

    it('merges translations in ids order (doc-specific wins)', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('common', {hello: {es: 'hola (common)'}});
      await tm.saveTranslations('Pages/index', {hello: {es: 'hola (doc)'}});
      const strings = await tm.loadTranslations({
        ids: ['common', 'Pages/index'],
        mode: 'draft',
      });
      expect(strings.hello.es).toBe('hola (doc)');
    });

    it('loads translations by tags using array-contains-any', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations(
        'common',
        {hello: {es: 'hola'}},
        {
          tags: ['common'],
        }
      );
      await tm.saveTranslations(
        'Pages/foo',
        {bye: {es: 'adios'}},
        {
          tags: ['Pages/foo'],
        }
      );
      const strings = await tm.loadTranslations({
        tags: ['common', 'other'],
        mode: 'draft',
      });
      expect(strings).toEqual({hello: {source: 'hello', es: 'hola'}});
    });

    it('loadTranslationsForLocale() applies config fallbacks', async () => {
      const client = createTestCmsClient({
        i18n: {
          locales: ['en', 'en-GB', 'en-CA'],
          fallbacks: {'en-CA': ['en-GB']},
        },
      });
      const tm = client.getTranslationsManager();
      await tm.saveTranslations('common', {
        color: {'en-GB': 'colour'},
        localOnly: {'en-CA': 'local (en-CA)', 'en-GB': 'local (en-GB)'},
        untranslated: {fr: 'french only'},
      });
      const translations = await tm.loadTranslationsForLocale('en-CA', {
        mode: 'draft',
      });
      expect(translations.color).toBe('colour');
      expect(translations.localOnly).toBe('local (en-CA)');
      // Strings translated only into locales outside the fallback chain are
      // not loaded (only the chain's locale docs are fetched).
      expect(translations.untranslated).toBeUndefined();
    });

    it('publishes draft translations to the published collection', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('Pages/index', {one: {es: 'uno'}});
      await tm.publishTranslations('Pages/index', {
        publishedBy: 'test@example.com',
      });

      const publishedPath = `Projects/${cmsClient.projectId}/TranslationsManager/published/Translations/Pages--index:es`;
      const publishedDoc = await cmsClient.db.doc(publishedPath).get();
      expect(publishedDoc.exists).toBe(true);
      const publishedData = publishedDoc.data() as TranslationsLocaleDoc;
      expect(publishedData.strings[hashStr('one')].translation).toBe('uno');
      expect(publishedData.sys.publishedBy).toBe('test@example.com');
      expect(publishedData.sys.publishedAt).toBeDefined();

      // The draft doc's sys should be updated with the published metadata.
      const draftPath = `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/Pages--index:es`;
      const draftDoc = await cmsClient.db.doc(draftPath).get();
      expect((draftDoc.data() as TranslationsLocaleDoc).sys.publishedBy).toBe(
        'test@example.com'
      );

      // Published translations are returned by loadTranslations().
      const strings = await tm.loadTranslations({ids: ['Pages/index']});
      expect(strings.one.es).toBe('uno');
    });

    it('publishTranslationsBulk() publishes multiple ids', async () => {
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('common', {hello: {es: 'hola'}});
      await tm.saveTranslations('Pages/index', {one: {es: 'uno', fr: 'un'}});
      const res = await tm.publishTranslationsBulk(
        ['common', 'Pages/index', 'does-not-exist'],
        {publishedBy: 'test@example.com'}
      );
      expect(res.publishedIds.sort()).toEqual(['Pages/index', 'common']);
      const strings = await tm.loadTranslations({
        ids: ['common', 'Pages/index'],
        mode: 'published',
      });
      expect(strings.hello.es).toBe('hola');
      expect(strings.one.fr).toBe('un');
    });

    it('saves and publishes translations larger than the request limit', async () => {
      // 30 locales x ~500KB per locale doc is ~15MB per translations doc,
      // which exceeds Firestore's ~11MB request payload limit.
      const tm = cmsClient.getTranslationsManager();
      const translations: Record<string, string> = {};
      for (let i = 0; i < 30; i++) {
        translations[`locale${i}`] = `${i}`.padEnd(500 * 1024, 'x');
      }
      await tm.saveTranslations('Pages/large', {big: translations});
      await tm.saveTranslations('common', {hello: {es: 'hola'}});
      const res = await tm.publishTranslationsBulk(['Pages/large', 'common']);
      expect(res.publishedIds.sort()).toEqual(['Pages/large', 'common']);
      const strings = await tm.loadTranslations({
        ids: ['Pages/large', 'common'],
        mode: 'published',
      });
      expect(Object.keys(strings.big)).toHaveLength(31);
      expect(strings.big.locale29).toBe(translations.locale29);
      expect(strings.hello.es).toBe('hola');
    });

    describe('importTranslationsFromV1', () => {
      async function seedV1Translation(
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

      it('groups strings into a translations doc per tag', async () => {
        await seedV1Translation('hello', {es: 'hola'}, [
          'Pages',
          'Pages/index',
          'common',
        ]);
        await seedV1Translation('bye', {es: 'adios'}, ['Pages', 'Pages/foo']);
        await seedV1Translation('untagged string', {es: 'sin etiqueta'});
        // Non-string locale values are skipped.
        await seedV1Translation('bad values', {es: ['not', 'a', 'string']}, [
          'common',
        ]);

        const tm = cmsClient.getTranslationsManager();
        const res = await tm.importTranslationsFromV1();
        expect(res.ids.sort()).toEqual([
          'Pages',
          'Pages/foo',
          'Pages/index',
          'common',
          'v1-untagged',
        ]);
        expect(res.stats.numStrings).toBe(4);
        expect(res.stats.numDocs).toBe(5);

        const commonStrings = await tm.loadTranslations({
          ids: ['common'],
          mode: 'draft',
        });
        expect(commonStrings.hello.es).toBe('hola');
        // The bad-values string has no valid translations but its source is
        // grouped without locale values (nothing to store per locale).
        expect(commonStrings['bad values']).toBeUndefined();

        const untagged = await tm.loadTranslations({
          ids: ['v1-untagged'],
          mode: 'draft',
        });
        expect(untagged['untagged string'].es).toBe('sin etiqueta');

        // The import saves drafts only; nothing is published yet.
        const published = await tm.loadTranslations({ids: ['common']});
        expect(published).toEqual({});
      });

      it('migrates the linked l10n sheet from the doc', async () => {
        await seedV1Translation('hello', {es: 'hola'}, ['Pages/index']);
        await cmsClient.db
          .doc(`Projects/${cmsClient.projectId}/Collections/Pages/Drafts/index`)
          .set({
            id: 'Pages/index',
            collection: 'Pages',
            slug: 'index',
            sys: {
              createdAt: Timestamp.now(),
              createdBy: 'test',
              modifiedAt: Timestamp.now(),
              modifiedBy: 'test',
              l10nSheet: {
                spreadsheetId: 'sheet123',
                gid: 0,
                linkedAt: Timestamp.now(),
                linkedBy: 'test@example.com',
              },
            },
            fields: {},
          });

        const tm = cmsClient.getTranslationsManager();
        await tm.importTranslationsFromV1();

        const localeDoc = await cmsClient.db
          .doc(
            `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/Pages--index:es`
          )
          .get();
        const data = localeDoc.data() as TranslationsLocaleDoc;
        expect(data.sys.linkedSheet?.spreadsheetId).toBe('sheet123');
      });

      it('publishes the imported translations with `publish: true`', async () => {
        await seedV1Translation('hello', {es: 'hola', fr: 'bonjour'}, [
          'common',
        ]);
        const tm = cmsClient.getTranslationsManager();
        await tm.importTranslationsFromV1({
          publish: true,
          modifiedBy: 'test-migration',
        });

        const published = await tm.loadTranslations({
          ids: ['common'],
          mode: 'published',
        });
        expect(published.hello).toMatchObject({es: 'hola', fr: 'bonjour'});

        // The draft is marked as published.
        const draftDoc = await cmsClient.db
          .doc(
            `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/common:es`
          )
          .get();
        const draft = draftDoc.data() as TranslationsLocaleDoc;
        expect(draft.tags).toEqual(['common']);
        expect(draft.sys.modifiedBy).toBe('test-migration');
        expect(draft.sys.publishedBy).toBe('test-migration');
        expect(draft.sys.publishedAt).toBeDefined();
      });

      it('prunes strings that are no longer used by the tagged doc', async () => {
        const pagesSchema: any = {
          name: 'Pages',
          fields: [
            {id: 'title', type: 'string', translate: true},
            {id: 'internalNote', type: 'string'},
          ],
        };
        const saveDoc = async (mode: string, slug: string, title: string) => {
          await cmsClient.db
            .doc(
              `Projects/${cmsClient.projectId}/Collections/Pages/${mode}/${slug}`
            )
            .set({
              id: `Pages/${slug}`,
              sys: {},
              fields: {title: title, internalNote: 'old title'},
            });
        };
        // The draft and published versions use different titles; strings
        // from both are kept.
        await saveDoc('Drafts', 'index', 'new title');
        await saveDoc('Published', 'index', 'live title');
        await seedV1Translation('new title', {es: 'nuevo'}, ['Pages/index']);
        await seedV1Translation('live title', {es: 'en vivo'}, ['Pages/index']);
        await seedV1Translation('old title', {es: 'viejo'}, [
          'Pages/index',
          'common',
        ]);
        // Strings tagged with a deleted doc are pruned.
        await seedV1Translation('deleted', {es: 'borrado'}, ['Pages/deleted']);
        // Tags that don't map to a collection are left untouched.
        await seedV1Translation('blog title', {es: 'blog'}, ['Blog/index']);

        const tm = cmsClient.getTranslationsManager();
        const res = await tm.importTranslationsFromV1({
          getCollectionSchema: async (collectionId) =>
            collectionId === 'Pages' ? pagesSchema : null,
        });
        expect(res.stats.numPrunedStrings).toBe(2);
        expect(res.ids.sort()).toEqual(['Blog/index', 'Pages/index', 'common']);

        const pageStrings = await tm.loadTranslations({
          ids: ['Pages/index'],
          mode: 'draft',
        });
        expect(Object.keys(pageStrings).sort()).toEqual([
          'live title',
          'new title',
        ]);
        // Pruning only applies to the doc's own translations doc.
        const commonStrings = await tm.loadTranslations({
          ids: ['common'],
          mode: 'draft',
        });
        expect(commonStrings['old title'].es).toBe('viejo');
      });

      it('skips locale docs found in the write cache', async () => {
        await seedV1Translation('hello', {es: 'hola', fr: 'bonjour'}, [
          'common',
        ]);
        const keys = new Set<string>();
        const writeCache = {
          has: (key: string) => keys.has(key),
          add: async (newKeys: string[]) => {
            newKeys.forEach((key) => keys.add(key));
          },
        };
        const tm = cmsClient.getTranslationsManager();
        await tm.importTranslationsFromV1({writeCache});
        expect(keys.size).toBe(2);

        // Simulate a doc that a retry should skip: delete it, then re-run the
        // import with the same cache.
        const esDocRef = cmsClient.db.doc(
          `Projects/${cmsClient.projectId}/TranslationsManager/draft/Translations/common:es`
        );
        await esDocRef.delete();
        await tm.importTranslationsFromV1({writeCache});
        expect((await esDocRef.get()).exists).toBe(false);

        // A changed string is written again.
        await seedV1Translation('hello', {es: 'hola!', fr: 'bonjour'}, [
          'common',
        ]);
        await tm.importTranslationsFromV1({writeCache});
        const strings = await tm.loadTranslations({
          ids: ['common'],
          mode: 'draft',
        });
        expect(strings.hello.es).toBe('hola!');
      });

      it('returns empty results when there are no v1 translations', async () => {
        const tm = cmsClient.getTranslationsManager();
        const res = await tm.importTranslationsFromV1();
        expect(res.ids).toEqual([]);
        expect(res.stats).toEqual({
          numStrings: 0,
          numDocs: 0,
          numPrunedStrings: 0,
        });
      });
    });
  }
);

describe('translationsForLocaleV2', () => {
  it('resolves translations through the fallback chain', () => {
    const strings = {
      one: {'en-GB': 'one (GB)', en: 'one (en)'},
      two: {en: 'two (en)'},
      three: {fr: 'trois'},
    };
    const translations = translationsForLocaleV2(strings, [
      'en-CA',
      'en-GB',
      'en',
    ]);
    expect(translations).toEqual({
      one: 'one (GB)',
      two: 'two (en)',
      three: 'three',
    });
  });

  it('skips empty translations in the chain', () => {
    const strings = {
      one: {'en-CA': '', 'en-GB': 'one (GB)'},
    };
    expect(translationsForLocaleV2(strings, ['en-CA', 'en-GB'])).toEqual({
      one: 'one (GB)',
    });
  });
});
