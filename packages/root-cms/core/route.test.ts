/**
 * Tests for `createRoute()` against the Firestore emulator (see
 * translations-manager.test.ts for details on the emulator setup).
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {RootCMSClient} from './client.js';
import {ReadCache} from './read-cache.js';
import {CreateRouteOptions, Route, createRoute} from './route.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'route-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'route-test');
}

let projectCounter = 0;

function createRootConfig(options?: {v2Translations?: boolean}): any {
  const app = getTestApp();
  const db = getFirestore(app);
  const projectId = `route-test-${Date.now()}-${projectCounter++}`;
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
      experiments: {v2TranslationsManager: options?.v2Translations ?? true},
    }),
    getFirebaseApp: () => app,
    getFirestore: () => db,
  };
  return {
    rootDir: '/test',
    i18n: {
      locales: ['en', 'en-GB', 'en-CA', 'de', 'es'],
      defaultLocale: 'en',
      fallbacks: {'en-CA': ['en-GB']},
    },
    plugins: [plugin],
  };
}

async function seedDoc(
  cmsClient: RootCMSClient,
  docId: string,
  options?: {mode?: 'draft' | 'published'; locales?: string[]}
) {
  const [collection, slug] = docId.split('/');
  const modeCollection = options?.mode === 'draft' ? 'Drafts' : 'Published';
  await cmsClient.db
    .doc(
      `Projects/${cmsClient.projectId}/Collections/${collection}/${modeCollection}/${slug}`
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
        locales: options?.locales ?? ['en', 'de', 'es'],
      },
      fields: {title: `Title for ${docId}`},
    });
}

/** Seeds the dependency graph with `docId` -> `refIds` published edges. */
async function seedDependencyGraph(
  cmsClient: RootCMSClient,
  docId: string,
  refIds: string[]
) {
  const [collection, slug] = docId.split('/');
  const graphPath = `Projects/${cmsClient.projectId}/DependencyGraph`;
  await cmsClient.db.doc(`${graphPath}/_meta`).set({lastRun: Timestamp.now()});
  await cmsClient.db.doc(`${graphPath}/published--${collection}`).set({
    mode: 'published',
    collection,
    refs: {[slug]: refIds},
  });
}

interface MockRequestOptions {
  slug: string;
  locale?: string;
  isDefaultLocale?: boolean;
  preferredLocales?: string[];
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Calls the route's SSR handler with a mock request. */
async function renderRoute(
  rootConfig: any,
  routeOptions: CreateRouteOptions | Route,
  reqOptions: MockRequestOptions
) {
  const route =
    'handle' in routeOptions ? routeOptions : createRoute(routeOptions);
  const render = vi.fn();
  const render404 = vi.fn();
  const headers: Record<string, string> = {};
  const isDefaultLocale = reqOptions.isDefaultLocale ?? !reqOptions.locale;
  const handlerContext = {
    params: {slug: reqOptions.slug},
    route: {locale: reqOptions.locale || 'en', isDefaultLocale},
    getPreferredLocale: (availableLocales: string[]) => {
      const lowerLocales = availableLocales.map((l) => l.toLowerCase());
      for (const locale of reqOptions.preferredLocales || []) {
        if (lowerLocales.includes(locale.toLowerCase())) {
          return locale;
        }
      }
      return 'en';
    },
    render,
    render404,
  };
  const req: any = {
    rootConfig,
    handlerContext,
    query: reqOptions.query || {},
    originalUrl: '/',
    get: (name: string) => reqOptions.headers?.[name.toLowerCase()],
  };
  const res: any = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    redirect: vi.fn(),
  };
  await route.handle(req, res);
  const renderArgs = render.mock.calls[0];
  return {
    redirect: res.redirect,
    rendered: render.mock.calls.length > 0,
    notFound: render404.mock.calls.length > 0,
    props: renderArgs?.[0],
    locale: renderArgs?.[1]?.locale as string | undefined,
    translations: renderArgs?.[1]?.translations as Record<string, string>,
    headers,
  };
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('createRoute', () => {
  let rootConfig: any;
  let cmsClient: RootCMSClient;

  beforeEach(() => {
    rootConfig = createRootConfig();
    cmsClient = new RootCMSClient(rootConfig);
  });

  it('renders the doc with translations for the url locale', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('common', {hello: {de: 'hallo', es: 'hola'}});
    await tm.saveTranslations('Pages/about', {about: {de: 'über'}});
    await tm.publishTranslationsBulk(['common', 'Pages/about']);

    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', locale: 'de'}
    );

    expect(result.rendered).toBe(true);
    expect(result.locale).toBe('de');
    expect(result.props.doc.id).toBe('Pages/about');
    // "common" is not loaded unless explicitly requested.
    expect(result.translations).toEqual({about: 'über'});
    expect(result.headers['cache-control']).toBe(
      'public, max-age=15, s-maxage=30'
    );
  });

  it('renders 404 when the doc or locale does not exist', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en']});
    const notFoundHook = vi.fn();

    let result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'missing'}
    );
    expect(result.notFound).toBe(true);

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', locale: 'de'}
    );
    expect(result.notFound).toBe(true);

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages', notFoundHook},
      {slug: 'about', locale: 'de'}
    );
    expect(result.rendered).toBe(false);
    expect(notFoundHook).toHaveBeenCalledOnce();
  });

  it('picks a doc locale when the preferred locale is not enabled', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['de', 'es']});

    // No preferred locale matches and the default locale ("en") isn't
    // enabled for the doc, so the first doc locale is used.
    let result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', preferredLocales: ['fr']}
    );
    expect(result.locale).toBe('de');

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages', defaultLocale: 'es'},
      {slug: 'about', preferredLocales: ['fr']}
    );
    expect(result.locale).toBe('es');

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', preferredLocales: ['es']}
    );
    expect(result.locale).toBe('es');
  });

  it('defaults "en" users in some countries to en-GB', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en', 'en-GB']});
    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {
        slug: 'about',
        preferredLocales: ['en'],
        headers: {'x-country-code': 'au'},
      }
    );
    expect(result.locale).toBe('en-GB');
    expect(result.props.country).toBe('AU');
    expect(result.headers['vary']).toBe(
      'accept-language,x-appengine-country,x-country-code'
    );
  });

  it('supports a custom resolveLocale()', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en', 'de', 'es']});
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('Pages/about', {
      hello: {de: 'hallo', es: 'hola'},
    });
    await tm.publishTranslationsBulk(['Pages/about']);

    const resolveLocale: CreateRouteOptions['resolveLocale'] = (ctx) => {
      if (ctx.isDefaultLocale && ctx.country === 'CH') {
        // Matched case-insensitively against the doc's locales.
        return 'DE';
      }
      if (ctx.routeLocale === 'xx') {
        return null;
      }
      return ctx.resolveDefault();
    };

    let result = await renderRoute(
      rootConfig,
      {collection: 'Pages', resolveLocale},
      {slug: 'about', query: {gl: 'ch'}}
    );
    expect(result.locale).toBe('de');
    expect(result.translations).toEqual({hello: 'hallo'});

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages', resolveLocale},
      {slug: 'about', locale: 'es'}
    );
    expect(result.locale).toBe('es');

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages', resolveLocale},
      {slug: 'about', locale: 'xx'}
    );
    expect(result.notFound).toBe(true);
  });

  it('loads translations for tags, referenced docs and batch docs', async () => {
    await seedDoc(cmsClient, 'Pages/index');
    await seedDoc(cmsClient, 'Global/header');
    await seedDependencyGraph(cmsClient, 'Pages/index', ['Authors/alice']);
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('common', {
      hello: {es: 'hola (common)'},
      bye: {es: 'adios'},
    });
    await tm.saveTranslations('Global/strings', {strings: {es: 'cadenas'}});
    await tm.saveTranslations('Authors/alice', {author: {es: 'autora'}});
    await tm.saveTranslations('Global/header', {header: {es: 'cabecera'}});
    await tm.saveTranslations('Pages/index', {hello: {es: 'hola (page)'}});
    // Not used by the route.
    await tm.saveTranslations('Pages/other', {other: {es: 'otro'}});
    await tm.publishTranslationsBulk([
      'common',
      'Global/strings',
      'Authors/alice',
      'Global/header',
      'Pages/index',
      'Pages/other',
    ]);

    const translationsHook = vi.fn((ctx) => {
      // The doc and locale are available to the translations hook.
      expect(ctx.doc.id).toBe('Pages/index');
      expect(ctx.locale).toBe('es');
      return {tags: ['common', 'Global/strings']};
    });
    const result = await renderRoute(
      rootConfig,
      {
        collection: 'Pages',
        translations: translationsHook,
        batchRequest: (req) => req.addDoc('Global/header'),
        preRenderHook: (props, ctx) => ({
          ...props,
          header: ctx.batchResponse!.docs['Global/header'],
        }),
      },
      {slug: 'index', locale: 'es'}
    );

    expect(translationsHook).toHaveBeenCalledOnce();
    expect(result.props.header.id).toBe('Global/header');
    expect(result.translations).toEqual({
      hello: 'hola (page)',
      bye: 'adios',
      strings: 'cadenas',
      author: 'autora',
      header: 'cabecera',
    });

    // Referenced docs can be excluded.
    const withoutRefs = await renderRoute(
      rootConfig,
      {collection: 'Pages', translateReferences: false},
      {slug: 'index', locale: 'es'}
    );
    expect(withoutRefs.translations).not.toHaveProperty('author');
  });

  it('never caches redirects', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    const result = await renderRoute(
      rootConfig,
      {
        collection: 'Pages',
        preRenderHook: (props) => ({
          ...props,
          $redirect: '/new/',
          $redirectCode: 301,
        }),
      },
      {slug: 'about', locale: 'de'}
    );
    expect(result.rendered).toBe(false);
    expect(result.redirect).toHaveBeenCalledWith(301, '/new/');
    expect(result.headers['cache-control']).toBe(
      'no-cache, no-store, max-age=0, must-revalidate'
    );
  });

  it('marks draft responses as private', async () => {
    await seedDoc(cmsClient, 'Pages/about', {mode: 'draft'});
    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', locale: 'de', query: {preview: 'true'}}
    );
    expect(result.props.mode).toBe('draft');
    expect(result.headers['cache-control']).toBe('private');
  });

  it('caches published reads in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await seedDoc(cmsClient, 'Pages/about');
      await seedDoc(cmsClient, 'Pages/about', {mode: 'draft'});
      const tm = cmsClient.getTranslationsManager();
      await tm.saveTranslations('Pages/about', {about: {de: 'über'}});
      await tm.publishTranslationsBulk(['Pages/about']);

      const route = createRoute({
        collection: 'Pages',
        cache: new ReadCache(),
        cacheControl: 'public, max-age=60, s-maxage=300',
        batchRequest: (req) => req.addQuery('pages', 'Pages'),
      });
      const first = await renderRoute(rootConfig, route, {
        slug: 'about',
        locale: 'de',
      });
      expect(first.headers['cache-control']).toBe(
        'public, max-age=60, s-maxage=300'
      );
      // Mutating the props doesn't affect later renders.
      first.props.doc.fields.title = 'Mutated';

      const docsPath = `Projects/${cmsClient.projectId}/Collections/Pages`;
      await cmsClient.db
        .doc(`${docsPath}/Published/about`)
        .update({'fields.title': 'Updated'});
      await cmsClient.db
        .doc(`${docsPath}/Drafts/about`)
        .update({'fields.title': 'Draft'});
      await tm.saveTranslations('Pages/about', {about: {de: 'neu'}});
      await tm.publishTranslationsBulk(['Pages/about']);

      const second = await renderRoute(rootConfig, route, {
        slug: 'about',
        locale: 'de',
      });
      expect(second.props.doc.fields.title).toBe('Title for Pages/about');
      expect(second.translations).toEqual({about: 'über'});

      // Draft reads are never cached.
      const preview = await renderRoute(rootConfig, route, {
        slug: 'about',
        locale: 'de',
        query: {preview: 'true'},
      });
      expect(preview.props.doc.fields.title).toBe('Draft');
      expect(preview.headers['cache-control']).toBe('private');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not cache reads outside of production', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    const route = createRoute({collection: 'Pages', cache: new ReadCache()});
    await renderRoute(rootConfig, route, {slug: 'about'});
    await cmsClient.db
      .doc(`Projects/${cmsClient.projectId}/Collections/Pages/Published/about`)
      .update({'fields.title': 'Updated'});
    const result = await renderRoute(rootConfig, route, {slug: 'about'});
    expect(result.props.doc.fields.title).toBe('Updated');
  });

  it('supports a custom createCmsClient()', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    const createCmsClient = vi.fn(
      (rootConfig, options) => new RootCMSClient(rootConfig, options)
    );
    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages', createCmsClient},
      {slug: 'about'}
    );
    expect(result.rendered).toBe(true);
    expect(createCmsClient).toHaveBeenCalledOnce();
  });

  it('supports v1 translations', async () => {
    rootConfig = createRootConfig({v2Translations: false});
    cmsClient = new RootCMSClient(rootConfig);
    await seedDoc(cmsClient, 'Pages/about');
    await cmsClient.saveTranslations({hello: {de: 'hallo'}}, ['common']);
    await cmsClient.saveTranslations({about: {de: 'über'}}, ['Pages/about']);
    await cmsClient.saveTranslations({other: {de: 'andere'}}, ['Pages/other']);

    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about', locale: 'de'}
    );
    expect(result.translations).toEqual({hello: 'hallo', about: 'über'});
  });

  it('generates ssg props', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en', 'de']});
    const tm = cmsClient.getTranslationsManager();
    await tm.saveTranslations('Pages/about', {about: {de: 'über'}});
    await tm.publishTranslationsBulk(['Pages/about']);

    const route = createRoute({collection: 'Pages', ssg: true});
    const paths = await route.getStaticPaths!({rootConfig});
    expect(paths.paths).toEqual([{params: {slug: 'about'}}]);

    const res: any = await route.getStaticProps!({
      rootConfig,
      params: {slug: 'about', $locale: 'de'},
    } as any);
    expect(res.locale).toBe('de');
    expect(res.props.doc.id).toBe('Pages/about');
    expect(res.translations).toEqual({about: 'über'});

    const notFound: any = await route.getStaticProps!({
      rootConfig,
      params: {slug: 'about', $locale: 'es'},
    } as any);
    expect(notFound).toEqual({notFound: true});
  });
});
