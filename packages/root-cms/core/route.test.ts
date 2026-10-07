/**
 * Tests for `createRoute()` against the Firestore emulator (see
 * translations-manager.test.ts for details on the emulator setup).
 */

import os from 'node:os';
import path from 'node:path';
import {getApps, initializeApp} from 'firebase-admin/app';
import {Timestamp, getFirestore} from 'firebase-admin/firestore';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {RootCMSClient} from './client.js';
import {FileSystemReadCacheStore} from './read-cache-fs-store.js';
import {ReadCache} from './read-cache.js';
import {CreateRouteOptions, Route, createRoute, getMode} from './route.js';

const FIREBASE_PROJECT_ID = 'rootjs-cms-admin-tests';

function getTestApp() {
  const existing = getApps().find((app) => app.name === 'route-test');
  if (existing) {
    return existing;
  }
  return initializeApp({projectId: FIREBASE_PROJECT_ID}, 'route-test');
}

let projectCounter = 0;

function createRootConfig(options?: {
  v2Translations?: boolean;
  i18n?: Record<string, any>;
}): any {
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
    i18n: options?.i18n || {
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
  slug?: string;
  params?: Record<string, string>;
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
    params: reqOptions.params || {slug: reqOptions.slug!},
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
    statusCode: 200,
    status(statusCode: number) {
      res.statusCode = statusCode;
      return res;
    },
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    redirect: vi.fn(),
  };
  await route.handle(req, res);
  const renderArgs = render.mock.calls[0];
  return {
    statusCode: renderArgs?.[1]?.statusCode as number | undefined,
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
  it('honors status codes set by hooks', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    let result = await renderRoute(
      rootConfig,
      {
        collection: 'Pages',
        preRenderHook: (props) => ({...props, $statusCode: 403}),
      },
      {slug: 'about'}
    );
    expect(result.rendered).toBe(true);
    expect(result.statusCode).toBe(403);

    result = await renderRoute(
      rootConfig,
      {
        collection: 'Pages',
        setResponseHeaders: (req, res) => res.status(410),
      },
      {slug: 'about'}
    );
    expect(result.statusCode).toBe(410);

    result = await renderRoute(
      rootConfig,
      {collection: 'Pages'},
      {slug: 'about'}
    );
    expect(result.statusCode).toBeUndefined();

    // A `notFoundHook` that sets 404 and renders a page responds with 404.
    result = await renderRoute(
      rootConfig,
      {
        collection: 'Pages',
        notFoundHook: async (req, res) => {
          res.status(404);
          await req.handlerContext!.render({notFound: true});
        },
      },
      {slug: 'missing'}
    );
    expect(result.rendered).toBe(true);
    expect(result.props).toEqual({notFound: true});
    expect(result.statusCode).toBe(404);
    expect(result.headers['cache-control']).toBe('private');
  });

  it('sets cache-control on 404 responses', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en']});
    const cases: Array<[CreateRouteOptions, MockRequestOptions]> = [
      // Invalid slug.
      [{collection: 'Pages'}, {slug: 'foo.bar'}],
      // Preview-only route.
      [{collection: 'Pages', previewOnly: true}, {slug: 'about'}],
      // Doc not found.
      [{collection: 'Pages'}, {slug: 'missing'}],
      // Locale not found.
      [{collection: 'Pages'}, {slug: 'about', locale: 'de'}],
    ];
    for (const [routeOptions, reqOptions] of cases) {
      const result = await renderRoute(rootConfig, routeOptions, reqOptions);
      expect(result.notFound).toBe(true);
      expect(result.headers['cache-control']).toBe('private');
    }

    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages', notFoundCacheControl: 'public, max-age=5'},
      {slug: 'missing'}
    );
    expect(result.headers['cache-control']).toBe('public, max-age=5');
  });

  it('supports a custom getMode()', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    await seedDoc(cmsClient, 'Pages/about', {mode: 'draft'});
    await cmsClient.db
      .doc(`Projects/${cmsClient.projectId}/Collections/Pages/Drafts/about`)
      .update({'fields.title': 'Draft'});

    const route = createRoute({
      collection: 'Pages',
      getMode: (req) => {
        if (req.get('x-force-draft') === 'true') {
          return 'draft';
        }
        return getMode(req);
      },
    });
    let result = await renderRoute(rootConfig, route, {
      slug: 'about',
      headers: {'x-force-draft': 'true'},
    });
    expect(result.props.mode).toBe('draft');
    expect(result.props.doc.fields.title).toBe('Draft');
    expect(result.headers['cache-control']).toBe('private');

    result = await renderRoute(rootConfig, route, {slug: 'about'});
    expect(result.props.mode).toBe('published');
    expect(result.props.doc.fields.title).toBe('Title for Pages/about');

    result = await renderRoute(rootConfig, route, {
      slug: 'about',
      query: {preview: 'true'},
    });
    expect(result.props.mode).toBe('draft');
  });

  it('supports a custom getSlug()', async () => {
    await seedDoc(cmsClient, 'Pages/section--123--index');
    const getSlug = (params: Record<string, string>) => {
      const slug = params.path || 'index';
      if (slug === 'hidden') {
        return '';
      }
      return /^section\/\d+$/.test(slug) ? `${slug}/index` : slug;
    };
    const route = createRoute({
      collection: 'Pages',
      slugParam: 'path',
      getSlug,
      ssg: true,
    });

    let result = await renderRoute(rootConfig, route, {
      params: {path: 'section/123'},
    });
    expect(result.rendered).toBe(true);
    expect(result.props.doc.id).toBe('Pages/section--123--index');

    result = await renderRoute(rootConfig, route, {params: {path: 'hidden'}});
    expect(result.notFound).toBe(true);

    const res: any = await route.getStaticProps!({
      rootConfig,
      params: {path: 'section/123', $locale: 'en'},
    } as any);
    expect(res.props.doc.id).toBe('Pages/section--123--index');

    const notFound: any = await route.getStaticProps!({
      rootConfig,
      params: {path: 'hidden', $locale: 'en'},
    } as any);
    expect(notFound).toEqual({notFound: true});
  });

  for (const v2Translations of [true, false]) {
    describe(`with ${v2Translations ? 'v2' : 'v1'} translations`, () => {
      beforeEach(() => {
        rootConfig = createRootConfig({
          v2Translations,
          i18n: {
            locales: ['en', 'ja', 'ja_jp', 'de'],
            defaultLocale: 'en',
            fallbackToLanguage: true,
          },
        });
        cmsClient = new RootCMSClient(rootConfig);
      });

      async function saveTranslations(
        id: string,
        strings: Record<string, Record<string, string>>
      ) {
        if (v2Translations) {
          const tm = cmsClient.getTranslationsManager();
          await tm.saveTranslations(id, strings);
          await tm.publishTranslationsBulk([id]);
        } else {
          await cmsClient.saveTranslations(strings, [id]);
        }
      }

      it('falls back from <lang>_<country> to <lang>', async () => {
        await seedDoc(cmsClient, 'Pages/about', {
          locales: ['en', 'ja', 'ja_jp'],
        });
        await saveTranslations('Pages/about', {
          hello: {ja: 'こんにちは (ja)', ja_jp: 'こんにちは (ja_jp)'},
          bye: {ja: 'さようなら (ja)'},
        });
        const expected = {
          hello: 'こんにちは (ja_jp)',
          bye: 'さようなら (ja)',
        };

        const result = await renderRoute(
          rootConfig,
          {collection: 'Pages'},
          {slug: 'about', locale: 'ja_jp'}
        );
        expect(result.locale).toBe('ja_jp');
        expect(result.translations).toEqual(expected);

        const route = createRoute({collection: 'Pages', ssg: true});
        const res: any = await route.getStaticProps!({
          rootConfig,
          params: {slug: 'about', $locale: 'ja_jp'},
        } as any);
        expect(res.locale).toBe('ja_jp');
        expect(res.translations).toEqual(expected);
      });

      it('replaces the doc with resolveDoc()', async () => {
        await seedDoc(cmsClient, 'Pages/about');
        await seedDoc(cmsClient, 'PagesDE/about');
        await saveTranslations('Pages/about', {
          hello: {de: 'hallo (page)'},
          about: {de: 'über (page)'},
        });
        await saveTranslations('PagesDE/about', {
          variant: {de: 'variante'},
        });

        const routeOptions: CreateRouteOptions = {
          collection: 'Pages',
          fetchData: () => ({extra: Promise.resolve('data')}),
          resolveDoc: async (ctx) => {
            expect(ctx.doc.id).toBe('Pages/about');
            expect(ctx.locale).toBe('de');
            expect(ctx.data).toEqual({extra: 'data'});
            if (ctx.req && ctx.req.get('x-country-code') !== 'DE') {
              return null;
            }
            return ctx.cmsClient.getDoc('PagesDE', ctx.slug, {mode: ctx.mode});
          },
          preRenderHook: (props, ctx) => {
            expect(ctx.doc).toBe(props.doc);
            return props;
          },
        };
        let result = await renderRoute(rootConfig, routeOptions, {
          slug: 'about',
          locale: 'de',
          headers: {'x-country-code': 'DE'},
        });
        expect(result.props.doc.id).toBe('PagesDE/about');
        expect(result.translations).toEqual({
          hello: 'hallo (page)',
          about: 'über (page)',
          variant: 'variante',
        });

        result = await renderRoute(rootConfig, routeOptions, {
          slug: 'about',
          locale: 'de',
        });
        expect(result.props.doc.id).toBe('Pages/about');
        expect(result.translations).toEqual({
          hello: 'hallo (page)',
          about: 'über (page)',
        });

        const route = createRoute({...routeOptions, ssg: true});
        const res: any = await route.getStaticProps!({
          rootConfig,
          params: {slug: 'about', $locale: 'de'},
        } as any);
        expect(res.props.doc.id).toBe('PagesDE/about');
        expect(res.translations).toEqual({
          hello: 'hallo (page)',
          about: 'über (page)',
          variant: 'variante',
        });
      });

      it('skips translations with translate: false', async () => {
        await seedDoc(cmsClient, 'Pages/about');
        await saveTranslations('Pages/about', {hello: {de: 'hallo'}});

        let result = await renderRoute(
          rootConfig,
          {collection: 'Pages', translate: false},
          {slug: 'about', locale: 'de'}
        );
        expect(result.rendered).toBe(true);
        expect(result.translations).toEqual({});

        const translate = vi.fn((ctx) => ctx.locale !== 'de');
        result = await renderRoute(
          rootConfig,
          {collection: 'Pages', translate},
          {slug: 'about', locale: 'de'}
        );
        expect(translate).toHaveBeenCalledOnce();
        expect(result.translations).toEqual({});

        const route = createRoute({
          collection: 'Pages',
          translate: false,
          ssg: true,
        });
        const res: any = await route.getStaticProps!({
          rootConfig,
          params: {slug: 'about', $locale: 'de'},
        } as any);
        expect(res.translations).toEqual({});
      });
    });
  }

  it('calls resolveLocale() in ssg mode', async () => {
    await seedDoc(cmsClient, 'Pages/about', {locales: ['en', 'de']});
    const resolveLocale = vi.fn<
      NonNullable<CreateRouteOptions['resolveLocale']>
    >((ctx) => {
      if (ctx.routeLocale === 'es') {
        return {locale: 'es', force: true};
      }
      if (ctx.routeLocale === 'en-GB') {
        return 'en';
      }
      return ctx.resolveDefault();
    });
    const route = createRoute({collection: 'Pages', ssg: true, resolveLocale});
    const getStaticProps = (locale: string) =>
      route.getStaticProps!({
        rootConfig,
        params: {slug: 'about', $locale: locale},
      } as any) as Promise<any>;

    let res = await getStaticProps('de');
    expect(res.locale).toBe('de');
    expect(resolveLocale).toHaveBeenLastCalledWith(
      expect.objectContaining({
        req: undefined,
        routeLocale: 'de',
        isDefaultLocale: false,
        docLocales: ['en', 'de'],
      })
    );

    // Locales outside of the doc's locales can be forced.
    res = await getStaticProps('es');
    expect(res.locale).toBe('es');
    expect(res.props.locale).toBe('es');

    res = await getStaticProps('en-GB');
    expect(res.locale).toBe('en');

    res = await getStaticProps('en-CA');
    expect(res).toEqual({notFound: true});

    // Forced locales work in SSR too.
    const result = await renderRoute(
      rootConfig,
      {collection: 'Pages', resolveLocale},
      {slug: 'about', locale: 'es'}
    );
    expect(result.locale).toBe('es');
  });

  it('shares cached reads across processes with a filesystem store', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const dir = path.join(
      os.tmpdir(),
      `root-cms-route-test-${Date.now()}-${Math.random()}`
    );
    try {
      await seedDoc(cmsClient, 'Pages/about');
      await seedDoc(cmsClient, 'Global/header');
      // Every client shares the same Firestore instance.
      const getAll = vi.spyOn(cmsClient.db, 'getAll');
      // Each route (and cache) simulates a separate SSG worker thread.
      const routes = Array.from({length: 4}, () =>
        createRoute({
          collection: 'Pages',
          ssg: true,
          cache: new ReadCache({store: new FileSystemReadCacheStore({dir})}),
          batchRequest: (req) => req.addDoc('Global/header'),
        })
      );
      const results: any[] = await Promise.all(
        routes.map((route) =>
          route.getStaticProps!({
            rootConfig,
            params: {slug: 'about', $locale: 'en'},
          } as any)
        )
      );
      results.forEach((res) => {
        expect(res.props.doc.id).toBe('Pages/about');
        expect(res.props.doc.sys.createdAt).toBeGreaterThan(0);
      });
      // The shared "Global/header" doc is only fetched once.
      const headerReads = (getAll.mock.calls as any[][])
        .flat()
        .filter((ref) => ref.path.endsWith('/Global/Published/header'));
      expect(headerReads).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await new FileSystemReadCacheStore({dir}).clear();
    }
  });

  it('clears read caches when docs are published', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await seedDoc(cmsClient, 'Pages/about');
      await seedDoc(cmsClient, 'Pages/about', {mode: 'draft'});
      const route = createRoute({collection: 'Pages', cache: true});
      let result = await renderRoute(rootConfig, route, {slug: 'about'});
      expect(result.props.doc.fields.title).toBe('Title for Pages/about');

      await cmsClient.db
        .doc(`Projects/${cmsClient.projectId}/Collections/Pages/Drafts/about`)
        .update({'fields.title': 'Updated'});
      await cmsClient.publishDocs(['Pages/about']);
      result = await renderRoute(rootConfig, route, {slug: 'about'});
      expect(result.props.doc.fields.title).toBe('Updated');

      await cmsClient.unpublishDocs(['Pages/about']);
      result = await renderRoute(rootConfig, route, {slug: 'about'});
      expect(result.notFound).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('supports RootCMSClient subclasses that declare a `cache` field', async () => {
    await seedDoc(cmsClient, 'Pages/about');
    class CustomClient extends RootCMSClient {
      cache = new Map<string, unknown>();
    }
    const client = new CustomClient(rootConfig, {cache: new ReadCache()});
    const res = await client.listDocs('Pages', {mode: 'published'});
    expect(res.docs.map((doc: any) => doc.id)).toEqual(['Pages/about']);
    expect(client.cache.size).toBe(0);
  });
});
