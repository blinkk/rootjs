/**
 * Utility for creating Root filesystem routes that are connected to a CMS doc.
 *
 * Usage:
 *
 * ```
 * // routes/blog/[slug].tsx
 * import {createRoute} from '@blinkk/root-cms';
 *
 * export default function Page(props) { ... }
 *
 * export const {handle} = createRoute({collection: 'BlogPosts'});
 * ```
 *
 * For SSG enabled sites, add `{ssg: true}`:
 *
 * ```
 * // routes/blog/[slug].tsx
 * import {createRoute} from '@blinkk/root-cms';
 *
 * export default function Page(props) { ... }
 *
 * export const {getStaticProps, getStaticPaths} = createRoute({collection: 'BlogPosts'});
 * ```
 */
import {
  GetStaticPaths,
  GetStaticProps,
  HandlerContext,
  replaceParams,
  Request,
  Response,
  RootConfig,
  RouteParams,
} from '@blinkk/root';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {normalizeSlug} from '../shared/slug.js';
import {
  BatchRequest,
  BatchResponse,
  DocMode,
  RootCMSClient,
  RootCMSClientOptions,
  translationsForLocale,
} from './client.js';
import type {DependencyGraphService} from './dependency-graph.js';
import {FileReadCache, getSsgReadCacheDir} from './file-read-cache.js';
import {ReadCache, RootCMSReadCache} from './read-cache.js';

/** Default Cache-Control header for published pages. */
const DEFAULT_CACHE_CONTROL = 'public, max-age=15, s-maxage=30';

/** In-memory read cache shared by every route created with `{cache: true}`. */
let sharedReadCache: ReadCache | undefined;

/**
 * Filesystem read caches shared by every route created with `{cache: true}`
 * for SSG builds, keyed by directory.
 */
const sharedFileReadCaches = new Map<string, FileReadCache>();

export interface RootCMSDoc<Fields = any> {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
  /** System-level metadata. */
  sys: {
    createdAt: number;
    createdBy: string;
    modifiedAt: number;
    modifiedBy: string;
    firstPublishedAt?: number;
    firstPublishedBy?: string;
    publishedAt?: number;
    publishedBy?: string;
    locales?: string[];
    /**
     * Fractional-index string defining the doc's custom order within the
     * collection. See the `customSorting` collection option.
     */
    sortKey?: string;
  };
  /** User-entered field values from the CMS. */
  fields?: Fields;
}

export type RouteRequest = Request & {
  rootConfig: RootConfig;
  cmsClient: RootCMSClient;
};

export type RouteResponse = Response;

export interface RouteContext {
  /**
   * HTTP request object. Only available in SSR mode.
   */
  req?: RouteRequest;

  /**
   * The slug of the page being requested.
   */
  slug: string;

  /**
   * Doc publishing mode.
   */
  mode: DocMode;

  /**
   * Client for interacting with Root CMS data.
   */
  cmsClient: RootCMSClient;

  /**
   * URL param map from filesystem routing.
   */
  params: RouteParams;

  /**
   * The route's CMS doc. Set once the doc is loaded, so it's available to
   * `translations()` and `preRenderHook()` but not `fetchData()`.
   */
  doc?: RootCMSDoc;

  /**
   * The locale being rendered. Set once the locale is resolved, so it's
   * available to `translations()` and `preRenderHook()` but not
   * `fetchData()`.
   */
  locale?: string;

  /**
   * The response of the route's batch request, containing anything added via
   * the `batchRequest()` option. Set once loaded, so it's available to
   * `translations()` and `preRenderHook()` but not `fetchData()`.
   */
  batchResponse?: BatchResponse;
}

export interface Route {
  /**
   * SSR handler.
   */
  handle: (req: RouteRequest, res: RouteResponse) => Promise<void>;

  /**
   * SSG handler props handler, enabled with `{ssg: true}`.
   */
  getStaticProps?: GetStaticProps;

  /**
   * SSG path params provider, enabled with `{ssg: true}`.
   */
  getStaticPaths?: GetStaticPaths;
}

/**
 * Context passed to the `resolveLocale()` option.
 */
export interface ResolveLocaleContext {
  /** HTTP request object. */
  req: RouteRequest;
  /** The route context, including the loaded `doc`. */
  routeContext: RouteContext;
  /** The route's CMS doc. */
  doc: RootCMSDoc;
  /** Locales the doc is enabled for, in the doc's casing. */
  docLocales: string[];
  /**
   * The locale from the URL, e.g. "de" for `/de/about/`. For the route's
   * default-locale URL (e.g. `/about/`), this is the site's default locale.
   */
  routeLocale: string;
  /**
   * Whether the request is for the route's default-locale URL (i.e. the URL
   * has no locale prefix), in which case the locale is typically determined
   * from the user's request (`?hl=`, `accept-language`, country, etc.).
   */
  isDefaultLocale: boolean;
  /**
   * Upper-cased country code from `?gl=` or the `x-country-code` /
   * `x-appengine-country` headers, or an empty string if unknown.
   */
  country: string;
  /** Value of the `?hl=` query param, or `null` if not set. */
  hl: string | null;
  /**
   * Runs the built-in locale resolution. Useful for customizing only some
   * requests and deferring to the default behavior for the rest.
   */
  resolveDefault: () => string | null;
}

export interface CreateRouteOptions {
  /**
   * Collection mapped to the route.
   */
  collection: string;

  /**
   * Route param name used for the slug. Used for dynamic routes, e.g.
   * `[...slug].tsx`. Defaults to "slug".
   */
  slugParam?: string;

  /**
   * Format pattern for slugs that use multiple param values to form the slug,
   * e.g. for experiments you might have something like:
   *
   * Route: routes/ex/[experimentId]/[...page].tsx
   * Doc ID: ExperimentPages/1234--about--foo
   * URL path: /ex/1234/about/foo/
   *
   * To grab the correct doc, use `{slugFormat: '[experimentId]/[page]'}`.
   *
   */
  slugFormat?: string;

  /**
   * Slug to use for the route. Used for non-dynamic, single-document routes.
   */
  slug?: string;

  /**
   * Callback function that returns a map of Promises that contain fetched data.
   * Once the promise is resolved, the values are injected into page's props
   * for rendering.
   */
  fetchData?: (context: RouteContext) => Record<string, Promise<any>>;

  /**
   * Hook for adding docs, queries, data sources or translations to the
   * route's batch request. Everything added here is fetched in parallel with
   * the route's doc, and translations for any docs or query results are
   * loaded along with the route's translations (for the resolved locale
   * only). The response is available as `context.batchResponse`.
   *
   * ```ts
   * createRoute({
   *   collection: 'Pages',
   *   batchRequest: (req) => {
   *     req.addDoc('Global/header');
   *     req.addQuery('posts', 'BlogPosts', {limit: 10});
   *   },
   *   preRenderHook: (props, ctx) => ({
   *     ...props,
   *     header: ctx.batchResponse!.docs['Global/header'],
   *     posts: ctx.batchResponse!.queries.posts,
   *   }),
   * });
   * ```
   */
  batchRequest?: (
    batchRequest: BatchRequest,
    context: RouteContext
  ) => void | Promise<void>;

  /**
   * Hook that's called when the doc is not found. If not provided, the default
   * 404 handler will be called.
   */
  notFoundHook?: (req: Request, res: Response) => void | Promise<void>;

  /**
   * Hook for amending any props values before being passed to the page
   * component.
   */
  preRenderHook?: (props: any, context: RouteContext) => any | Promise<any>;

  /**
   * Hook for setting any response headers.
   */
  setResponseHeaders?: (req: Request, res: Response) => void;

  /**
   * Translations configuration. The returned `tags` are additional
   * translations ids to load (e.g. "Global/strings"), on top of "common" and
   * the route doc's own translations. Called after the doc is loaded, so
   * `context.doc` and `context.locale` are available.
   */
  translations?: (context: RouteContext) => {tags?: string[]};

  /**
   * Whether to also load translations for the docs referenced by the route's
   * doc (e.g. via `schema.reference()` fields), as tracked by the CMS
   * dependency graph. Set to "transitive" to include docs referenced by those
   * docs, recursively. Defaults to `true` (direct references only). Has no
   * effect when the dependency graph or the v2 translations manager is
   * disabled.
   */
  translateReferences?: boolean | 'transitive';

  /**
   * Sets Cache-Control header to `private`.
   */
  disableCacheControl?: boolean;

  /**
   * Cache-Control header for published pages. Defaults to
   * `public, max-age=15, s-maxage=30`. Draft (preview) pages are always
   * `private`.
   */
  cacheControl?: string;

  /**
   * Caches published CMS reads, which saves a Firestore round trip on most
   * page renders. Pass `true` to use the default caches, which are shared by
   * every route:
   *
   * - SSR: an in-memory `ReadCache` (reads are cached for 60 seconds).
   * - SSG: a `FileReadCache` in `node_modules/.cache/root-cms/ssg-reads/`, so
   *   that the cache is shared by every thread of the build (e.g. with
   *   `root build --threads`). It's cleared at the start of every build.
   *
   * Or pass a cache to use for both, e.g.
   * `{cache: new ReadCache({ttl: 30 * 1000})}`.
   *
   * Published content can take up to the cache's ttl to show up (plus any CDN
   * cache time, see `cacheControl`). Draft (preview) requests are never
   * cached. Ignored outside of production (i.e. unless `NODE_ENV` is
   * "production").
   */
  cache?: boolean | RootCMSReadCache;

  /**
   * Creates the route's `RootCMSClient`, e.g. to overlay a change proposal
   * with `{proposal}`. The `options` (which include the read `cache`, if
   * enabled) should be passed along to the client.
   *
   * ```ts
   * createRoute({
   *   collection: 'Pages',
   *   createCmsClient: (rootConfig, options) =>
   *     new RootCMSClient(rootConfig, {...options, proposal}),
   * });
   * ```
   */
  createCmsClient?: (
    rootConfig: RootConfig,
    options: RootCMSClientOptions
  ) => RootCMSClient;

  /**
   * Enables SSG mode for sites that serve on SCS or other static servers.
   */
  ssg?: boolean;

  /**
   * Overrides the "mode" (draft vs published) for SSG builds. Primarily
   * intended for testing prior to launches.
   */
  ssgMode?: DocMode;

  /**
   * Whether the route should only be available with ?preview=true.
   */
  previewOnly?: boolean;

  /**
   * Overrides the default locale for the route.
   */
  defaultLocale?: string;

  /**
   * Custom locale lookup for SSR requests, for sites with custom locale logic
   * (e.g. mapping countries or URL params to locales). Returns the locale to
   * render, which must be one of `ctx.docLocales` (matched
   * case-insensitively). Returning `null` or a locale the doc isn't enabled
   * for renders the 404 page (or calls `notFoundHook`).
   *
   * Call `ctx.resolveDefault()` to fall back to the built-in logic:
   *
   * ```ts
   * createRoute({
   *   collection: 'Pages',
   *   resolveLocale: (ctx) => {
   *     if (ctx.isDefaultLocale && ctx.country === 'CH') {
   *       return ctx.docLocales.includes('de-CH') ? 'de-CH' : 'de';
   *     }
   *     return ctx.resolveDefault();
   *   },
   * });
   * ```
   *
   * SSG builds always render the locale from the build path.
   */
  resolveLocale?: (
    ctx: ResolveLocaleContext
  ) => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * Utility for creating Root filesystem routes that are connected to a CMS doc.
 */
export function createRoute(options: CreateRouteOptions): Route {
  let cmsClient: RootCMSClient | undefined;
  // Published requests read through clients that cache reads (when
  // `options.cache` is enabled), so most renders skip the Firestore round
  // trips. SSR and SSG use different caches by default.
  let ssrCachedCmsClient: RootCMSClient | undefined;
  let ssgCachedCmsClient: RootCMSClient | undefined;
  let dependencyGraphService: DependencyGraphService | undefined;

  function getReadCache(
    rootConfig: RootConfig,
    ssg: boolean
  ): RootCMSReadCache | undefined {
    if (!options.cache || process.env.NODE_ENV !== 'production') {
      return undefined;
    }
    if (options.cache !== true) {
      return options.cache;
    }
    if (ssg) {
      const dir = getSsgReadCacheDir(rootConfig.rootDir);
      let fileReadCache = sharedFileReadCaches.get(dir);
      if (!fileReadCache) {
        fileReadCache = new FileReadCache({dir});
        sharedFileReadCaches.set(dir, fileReadCache);
      }
      return fileReadCache;
    }
    sharedReadCache ??= new ReadCache();
    return sharedReadCache;
  }

  function newCmsClient(
    rootConfig: RootConfig,
    clientOptions: RootCMSClientOptions
  ) {
    if (options.createCmsClient) {
      return options.createCmsClient(rootConfig, clientOptions);
    }
    return new RootCMSClient(rootConfig, clientOptions);
  }

  /**
   * Returns the client for reading docs in the given mode, for either an SSR
   * request or an SSG build.
   */
  function getCmsClient(
    rootConfig: RootConfig,
    mode: DocMode,
    {ssg}: {ssg: boolean}
  ) {
    const cache =
      mode === 'published' ? getReadCache(rootConfig, ssg) : undefined;
    if (cache && ssg) {
      ssgCachedCmsClient ??= newCmsClient(rootConfig, {cache});
      return ssgCachedCmsClient;
    }
    if (cache) {
      ssrCachedCmsClient ??= newCmsClient(rootConfig, {cache});
      return ssrCachedCmsClient;
    }
    cmsClient ??= newCmsClient(rootConfig, {});
    return cmsClient;
  }

  function getSlug(params: RouteParams) {
    if (options.slug) {
      return options.slug;
    }
    if (options.slugFormat) {
      return replaceParams(options.slugFormat, params);
    }
    const slugParam = options.slugParam || 'slug';
    const slug = params[slugParam] || 'index';
    return slug;
  }

  function getDocId(slug: string) {
    return `${options.collection}/${normalizeSlug(slug)}`;
  }

  function getDefaultLocale(rootConfig: RootConfig) {
    return options.defaultLocale || rootConfig.i18n?.defaultLocale || 'en';
  }

  /**
   * Returns the locales the doc is enabled for, defaulting to the route's
   * default locale.
   */
  function getDocLocales(doc: RootCMSDoc, rootConfig: RootConfig) {
    const locales = doc.sys?.locales || [];
    return locales.length > 0 ? locales : [getDefaultLocale(rootConfig)];
  }

  /**
   * Translations are only loaded for sites that have >1 locale configured.
   */
  function shouldTranslate(cmsClient: RootCMSClient) {
    const siteLocales = cmsClient.rootConfig.i18n?.locales || ['en'];
    return siteLocales.length > 1;
  }

  async function fetchData(
    fetchOptions: RouteContext
  ): Promise<Record<string, any>> {
    if (!options.fetchData) {
      return {};
    }
    const promisesMap = options.fetchData(fetchOptions);
    return resolvePromisesMap(promisesMap);
  }

  /**
   * Returns the ids of the docs referenced by the route's doc, used for
   * loading their translations. Errors are logged and swallowed so that a
   * dependency graph failure never breaks the page.
   */
  async function getReferencedDocIds(
    cmsClient: RootCMSClient,
    docId: string,
    mode: DocMode
  ): Promise<string[]> {
    if (
      options.translateReferences === false ||
      !shouldTranslate(cmsClient) ||
      !cmsClient.isV2TranslationsEnabled()
    ) {
      return [];
    }
    try {
      if (!dependencyGraphService) {
        // Lazy load the dependency graph module to minimize the amount of
        // code loaded by routes that don't need it.
        const {DependencyGraphService} = await import('./dependency-graph.js');
        dependencyGraphService = new DependencyGraphService(
          cmsClient.rootConfig
        );
      }
      if (!dependencyGraphService.isEnabled()) {
        return [];
      }
      const graph = await dependencyGraphService.getGraph(mode);
      return graph.getDependencies(docId, {
        transitive: options.translateReferences === 'transitive',
      });
    } catch (err) {
      console.error(`failed to load the dependency graph for ${docId}:`);
      console.error(String(err.stack || err));
      return [];
    }
  }

  /**
   * Loads the route's content in a single round trip: the route's doc, the
   * route's batch request (see `options.batchRequest`), the ids of the docs
   * it references, and `options.fetchData`. Translations are loaded
   * separately with `loadTranslations()` once the locale is known.
   */
  async function loadContent(routeContext: RouteContext) {
    const {cmsClient, mode, slug} = routeContext;
    const docId = getDocId(slug);
    const batchRequest = cmsClient.createBatchRequest({mode, translate: true});
    if (options.batchRequest) {
      await options.batchRequest(batchRequest, routeContext);
    }
    const [doc, batchResponse, referencedDocIds, data] = await Promise.all([
      cmsClient.getDoc<RootCMSDoc>(options.collection, slug, {mode}),
      batchRequest.fetchContent(),
      getReferencedDocIds(cmsClient, docId, mode),
      fetchData(routeContext),
    ]);
    if (doc) {
      routeContext.doc = doc;
    }
    routeContext.batchResponse = batchResponse;
    return {doc, data, batchRequest, batchResponse, referencedDocIds};
  }

  /**
   * Loads the translations for the resolved locale. Translations are loaded
   * for "common", any `options.translations()` tags, the docs referenced by
   * the route's doc, the route's doc, and any docs added to the batch
   * request, in that order of precedence (later ids win).
   */
  async function loadTranslations(
    routeContext: RouteContext,
    content: Awaited<ReturnType<typeof loadContent>>,
    locale: string
  ): Promise<Record<string, string>> {
    const {cmsClient, slug} = routeContext;
    if (!shouldTranslate(cmsClient)) {
      return {};
    }
    const docId = getDocId(slug);
    const tags = options.translations?.(routeContext)?.tags || [];

    // The v1 translations system stores strings by tag, so load them with a
    // single tags query.
    if (!cmsClient.isV2TranslationsEnabled()) {
      const translationsMap = await cmsClient.loadTranslations({
        tags: ['common', docId, ...tags],
      });
      const fallbackLocales = resolveLocaleFallbacks(
        cmsClient.rootConfig.i18n,
        locale
      );
      return translationsForLocale(translationsMap, fallbackLocales);
    }

    const {batchRequest, batchResponse, referencedDocIds} = content;
    batchRequest.addTranslations('common');
    tags.forEach((tag) => batchRequest.addTranslations(tag));
    referencedDocIds.forEach((id) => batchRequest.addTranslations(id));
    batchRequest.addTranslations(docId);
    // Only the resolved locale (and its fallbacks) are fetched.
    await batchRequest.fetchTranslations(batchResponse, {locales: [locale]});
    return batchResponse.getTranslations(locale);
  }

  async function generateProps(routeContext: RouteContext, locale: string) {
    const {slug, mode, cmsClient} = routeContext;
    const content = await loadContent(routeContext);
    const {doc, data} = content;
    if (!doc) {
      return {notFound: true};
    }
    const docLocales = getDocLocales(doc, cmsClient.rootConfig);
    const docLocale = findLocale(docLocales, locale);
    if (!docLocale) {
      return {notFound: true};
    }
    routeContext.locale = docLocale;

    const translations = await loadTranslations(
      routeContext,
      content,
      docLocale
    );
    let props: any = {...data, locale: docLocale, mode, slug, doc};
    if (options.preRenderHook) {
      props = await options.preRenderHook(props, routeContext);
    }

    return {props, locale: docLocale, translations};
  }

  const route: Route = {
    // SSR handler.
    handle: async (req: RouteRequest, res: Response) => {
      const mode = await getMode(req);
      const cmsClient = getCmsClient(req.rootConfig, mode, {ssg: false});
      req.cmsClient = cmsClient;
      const ctx = req.handlerContext as HandlerContext;
      const slug = getSlug(ctx.params);
      // Ignore slugs with `--` and `.` in it, these generally should not be
      // handled by a CMS route.
      if (slug.includes('.') || slug.includes('--')) {
        return ctx.render404();
      }

      // For previewOnly routes, render the 404 page if ?preview=true is not
      // in the URL.
      if (options.previewOnly && mode !== 'draft') {
        return ctx.render404();
      }

      const notFound = async () => {
        if (options.notFoundHook) {
          await options.notFoundHook(req, res);
          return;
        }
        return ctx.render404();
      };

      const routeContext: RouteContext = {
        req,
        slug,
        mode,
        cmsClient,
        params: ctx.params,
      };

      const content = await loadContent(routeContext);
      const {doc, data} = content;
      if (!doc) {
        return notFound();
      }

      const hl = getFirstQueryParam(req, 'hl');

      let country =
        getFirstQueryParam(req, 'gl') ||
        req.get('x-country-code') ||
        req.get('x-appengine-country') ||
        '';
      if (country) {
        country = country.toUpperCase();
      }

      /**
       * Selects a locale based on user's http req (query params, accept-lang,
       * country) from a list of available locales.
       */
      function getFallbackLocale(docLocales: string[]) {
        // TODO(stevenle): figure out a better, more generic way to handle this.
        if (hl === 'fr') {
          if (country === 'CA') {
            const frCA = findLocale(docLocales, 'fr-ca');
            if (frCA) {
              return frCA;
            }
          }
          if (country === 'FR') {
            const frFR = findLocale(docLocales, 'fr-fr');
            if (frFR) {
              return frFR;
            }
          }
        }
        if (hl === 'pt') {
          if (country === 'BR') {
            const ptBR = findLocale(docLocales, 'pt-br');
            if (ptBR) {
              return ptBR;
            }
          }
          if (country === 'PT') {
            const ptPT = findLocale(docLocales, 'pt-pt');
            if (ptPT) {
              return ptPT;
            }
          }
        }

        // NOTE: `getPreferredLocale()` returns the site's default locale when
        // none of the user's locales match, which may not be enabled for the
        // doc.
        const preferredLocale = ctx.getPreferredLocale(docLocales);

        // "en" users in certain countries should default to en-GB if it
        // exists in the doc.
        // TODO(stevenle): add a formal fallback configuration system.
        if (
          preferredLocale.toLowerCase() === 'en' &&
          ['AU', 'CA', 'IN', 'MY'].includes(country)
        ) {
          const enCountry =
            findLocale(docLocales, `en-${country}`) ||
            findLocale(docLocales, 'en-gb');
          if (enCountry) {
            return enCountry;
          }
        }

        const docLocale = findLocale(docLocales, preferredLocale);
        if (docLocale) {
          return docLocale;
        }
        return (
          findLocale(docLocales, getDefaultLocale(req.rootConfig)) ||
          docLocales[0]
        );
      }

      const docLocales = getDocLocales(doc, req.rootConfig);
      const resolveDefault = () => {
        if (ctx.route.isDefaultLocale) {
          return getFallbackLocale(docLocales);
        }
        return findLocale(docLocales, ctx.route.locale);
      };
      const resolvedLocale = options.resolveLocale
        ? await options.resolveLocale({
            req,
            routeContext,
            doc,
            docLocales,
            routeLocale: ctx.route.locale,
            isDefaultLocale: !!ctx.route.isDefaultLocale,
            country,
            hl,
            resolveDefault,
          })
        : resolveDefault();
      const locale = resolvedLocale && findLocale(docLocales, resolvedLocale);
      if (!locale) {
        return notFound();
      }
      routeContext.locale = locale;

      const translations = await loadTranslations(
        routeContext,
        content,
        locale
      );
      let props: any = {...data, req, locale, mode, slug, doc, country};
      if (options.preRenderHook) {
        props = await options.preRenderHook(props, routeContext);
      }

      if (props.$redirect) {
        const redirectCode = props.$redirectCode || 302;
        console.log(`redirecting to: ${props.$redirect} (${redirectCode})`);
        redirectWithQuery(req, res, redirectCode, props.$redirect);
        return;
      }

      if (options.disableCacheControl || mode === 'draft') {
        // Never cache draft (preview) content in shared caches.
        res.setHeader('cache-control', 'private');
      } else {
        res.setHeader(
          'cache-control',
          options.cacheControl || DEFAULT_CACHE_CONTROL
        );
        if (ctx.route.isDefaultLocale) {
          res.setHeader(
            'vary',
            'accept-language,x-appengine-country,x-country-code'
          );
        }
      }
      if (options.setResponseHeaders) {
        options.setResponseHeaders(req, res);
      }
      return ctx.render(props, {locale, translations});
    },
  };

  // SSG handlers (only enabled with `{ssg: true}`).
  if (options.ssg) {
    route.getStaticPaths = async (ctx) => {
      // Single-doc routes and multi-param slugs can't be mapped back to route
      // params.
      if (options.slug || options.slugFormat) {
        return {paths: []};
      }
      const mode = options.ssgMode || 'published';
      const cmsClient = getCmsClient(ctx.rootConfig, mode, {ssg: true});
      const res = await cmsClient.listDocs<{slug: string}>(options.collection, {
        mode,
      });
      const ssgPaths: Array<{params: Record<string, string>}> = [];
      const slugParam = options.slugParam || 'slug';
      res.docs.forEach((doc) => {
        const params: Record<string, string> = {};
        params[slugParam] = doc.slug.replaceAll('--', '/');
        ssgPaths.push({params});
      });
      return {paths: ssgPaths};
    };

    route.getStaticProps = async (ctx) => {
      const slug = getSlug(ctx.params);
      const mode = options.ssgMode || 'published';
      const cmsClient = getCmsClient(ctx.rootConfig, mode, {ssg: true});
      const routeContext: RouteContext = {
        req: undefined,
        slug,
        mode,
        cmsClient,
        params: ctx.params,
      };

      return generateProps(routeContext, ctx.params.$locale);
    };
  }

  return route;
}

/**
 * Returns the locale from `locales` matching `locale` case-insensitively (in
 * the casing used by `locales`), or `null` if there's no match.
 */
function findLocale(locales: string[], locale: string): string | null {
  const lowerLocale = String(locale).toLowerCase();
  return locales.find((l) => l.toLowerCase() === lowerLocale) || null;
}

export async function resolvePromisesMap(
  promisesMap: Record<string, Promise<any>>
): Promise<Record<string, any>> {
  const keys = Object.keys(promisesMap);
  const promises = Object.values(promisesMap);
  const results = await Promise.all(promises);
  const resultMap: Record<string, any> = {};
  keys.forEach((key, index) => {
    resultMap[key] = results[index];
  });
  return resultMap;
}

/**
 * Returns the first query param value in a given request.
 *
 * For example, for a URL like `/?foo=bar&foo=baz`, calling
 * `getFirstQueryParam(req, 'foo')` would return `"bar"`.
 */
export function getFirstQueryParam(req: Request, key: string): string | null {
  const val = req.query[key];
  if (val === null || val === undefined) {
    return null;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) {
      return null;
    }
    return String(val[0]);
  }
  return String(val);
}

/**
 * Issues an HTTP redirect, preserving any query params from the original req.
 *
 * Redirects are never cached (even 301s), so that a redirect that's later
 * removed in the CMS takes effect immediately for browsers and CDNs.
 */
export function redirectWithQuery(
  req: Request,
  res: Response,
  redirectCode: number,
  redirectPath: string
) {
  res.setHeader(
    'cache-control',
    'no-cache, no-store, max-age=0, must-revalidate'
  );
  // Only preserve query params for relative urls.
  if (!redirectPath.startsWith('/')) {
    res.redirect(redirectCode, redirectPath);
    return;
  }
  const queryStr = getQueryStr(req);
  const redirectUrl = queryStr ? `${redirectPath}?${queryStr}` : redirectPath;
  res.redirect(redirectCode, redirectUrl);
}

/**
 * Returns the query string for a request, or empty string if no query.
 */
function getQueryStr(req: Request): string {
  const qIndex = req.originalUrl.indexOf('?');
  if (qIndex === -1) {
    return '';
  }
  return req.originalUrl.slice(qIndex + 1);
}

/**
 * Returns the CMS document mode associated with the request.
 */
export async function getMode(req: Request): Promise<DocMode> {
  const isPreview = String(req.query.preview) === 'true';
  let mode: DocMode = isPreview ? 'draft' : 'published';
  // Allow toggling the "published" mode with ?preview=true&mode=published.
  if (isPreview && req.query.mode === 'published') {
    mode = 'published';
  }
  return mode;
}
