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
import {
  BatchRequest,
  BatchResponse,
  DocMode,
  RootCMSClient,
} from './client.js';

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
   * Batch request helper for fetching CMS data.
   */
  batchRequest: BatchRequest;

  /**
   * Batch response populated after calling `batchRequest.fetch()`.
   */
  batchResponse?: BatchResponse;

  /**
   * URL param map from filesystem routing.
   */
  params: RouteParams;
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
   * Translations configuration.
   */
  translations?: (context: RouteContext) => {tags?: string[]};

  /**
   * Sets Cache-Control header to `private`.
   */
  disableCacheControl?: boolean;

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
}

/**
 * Utility for creating Root filesystem routes that are connected to a CMS doc.
 */
export function createRoute(options: CreateRouteOptions): Route {
  let cmsClient: RootCMSClient;

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

  async function fetchData(
    fetchOptions: RouteContext
  ): Promise<Record<string, any>> {
    if (!options.fetchData) {
      return {};
    }
    const promisesMap = options.fetchData(fetchOptions);
    return resolvePromisesMap(promisesMap);
  }

  async function generateProps(
    routeContext: RouteContext,
    locale: string,
    siteLocales: string[]
  ) {
    const {slug, mode, batchRequest} = routeContext;
    const normalizedSlug = slug.replaceAll('/', '--');
    const docId = `${options.collection}/${normalizedSlug}`;
    batchRequest.addDoc(docId);

    const docTranslationsId = docId;
    const translationsTags = new Set<string>(['common', docTranslationsId]);
    if (options.translations) {
      const tags = options.translations(routeContext)?.tags || [];
      tags.forEach((tag) => translationsTags.add(tag));
    }
    const shouldLoadTranslations = siteLocales.length > 1;
    if (shouldLoadTranslations) {
      translationsTags.forEach((tag) => {
        if (tag !== docTranslationsId) {
          batchRequest.addTranslations(tag);
        }
      });
    }

    const dataPromise = fetchData(routeContext);
    const batchResponse = await batchRequest.fetch();
    routeContext.batchResponse = batchResponse;
    const data = await dataPromise;

    const doc = batchResponse.docs[docId] as RootCMSDoc | undefined;
    if (!doc) {
      return {notFound: true};
    }
    const docLocales = doc.sys.locales || [];
    if (!docLocales.includes(locale)) {
      return {notFound: true};
    }

    const translations = shouldLoadTranslations
      ? batchResponse.getTranslations(locale)
      : {};
    let props: any = {...data, locale, mode, slug, doc};
    if (options.preRenderHook) {
      props = await options.preRenderHook(props, routeContext);
    }

    return {props, locale, translations};
  }

  const route: Route = {
    // SSR handler.
    handle: async (req: RouteRequest, res: Response) => {
      if (!cmsClient) {
        cmsClient = new RootCMSClient(req.rootConfig);
      }
      req.cmsClient = cmsClient;
      const ctx = req.handlerContext as HandlerContext;
      const slug = getSlug(ctx.params);
      // Ignore slugs with `--` and `.` in it, these generally should not be
      // handled by a CMS route.
      if (slug.includes('.') || slug.includes('--')) {
        res.setHeader('cache-control', 'private');
        return ctx.render404();
      }
      const mode = await getMode(req);
      const siteLocales = req.rootConfig?.i18n?.locales || ['en'];

      // For previewOnly routes, render the 404 page if ?preview=true is not
      // in the URL.
      if (options.previewOnly && mode !== 'draft') {
        return ctx.render404();
      }

      const batchRequest = cmsClient.createBatchRequest({
        mode,
        translate: siteLocales.length > 1,
      });
      const routeContext: RouteContext = {
        req,
        slug,
        mode,
        cmsClient,
        params: ctx.params,
        batchRequest,
      };

      const normalizedSlug = slug.replaceAll('/', '--');
      const docId = `${options.collection}/${normalizedSlug}`;
      batchRequest.addDoc(docId);

      const docTranslationsId = docId;
      const translationsTags = new Set<string>(['common', docTranslationsId]);
      if (options.translations) {
        const tags = options.translations(routeContext)?.tags || [];
        tags.forEach((tag) => translationsTags.add(tag));
      }

      const shouldLoadTranslations = siteLocales.length > 1;
      if (shouldLoadTranslations) {
        translationsTags.forEach((tag) => {
          if (tag !== docTranslationsId) {
            batchRequest.addTranslations(tag);
          }
        });
      }

      const dataPromise = fetchData(routeContext);
      const batchResponse = await batchRequest.fetch();
      routeContext.batchResponse = batchResponse;
      const data = await dataPromise;
      const doc = batchResponse.docs[docId] as RootCMSDoc | undefined;
      if (!doc) {
        // console.log(`doc not found: ${options.collection}/${slug}`);
        if (options.notFoundHook) {
          await options.notFoundHook(req, res);
          return;
        }
        res.setHeader('cache-control', 'private');
        return ctx.render404();
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
        const localesMap: Record<string, string> = {};
        docLocales.forEach((docLocale) => {
          const lowerLocale = docLocale.toLowerCase();
          localesMap[lowerLocale] = docLocale;
        });

        // TODO(stevenle): figure out a better, more generic way to handle this.
        if (hl === 'fr') {
          if (country === 'CA' && 'fr-ca' in localesMap) {
            return localesMap['fr-ca'];
          }
          if (country === 'FR' && 'fr-fr' in localesMap) {
            return localesMap['fr-fr'];
          }
        }
        if (hl === 'pt') {
          if (country === 'BR' && 'pt-br' in localesMap) {
            return localesMap['pt-br'];
          }
          if (country === 'PT' && 'pt-pt' in localesMap) {
            return localesMap['pt-pt'];
          }
        }

        const preferredLocale = ctx.getPreferredLocale(docLocales);
        if (preferredLocale) {
          // The `getPreferredLocale()` method returns the locale in lower-case,
          // convert it to the doc's locale casing.
          // TODO(stevenle): fix this upstream.

          const normalizedLocale =
            localesMap[preferredLocale] || preferredLocale;

          // "en" users in certain countries should default to en-GB if it
          // exists in the doc.
          // TODO(stevenle): add a formal fallback configuration system.
          if (preferredLocale === 'en') {
            if (['AU', 'CA', 'IN', 'MY'].includes(country)) {
              if (localesMap[`en-${country.toLowerCase()}`]) {
                return localesMap[`en-${country.toLowerCase()}`];
              }
              if (localesMap['en-gb']) {
                return localesMap['en-gb'];
              }
            }
          }

          return normalizedLocale;
        }

        const defaultLocale =
          options.defaultLocale || req.rootConfig?.i18n?.defaultLocale || 'en';
        if (docLocales.includes(defaultLocale)) {
          return defaultLocale;
        }

        return docLocales[0];
      }

      const sys = doc.sys;
      const docLocales = sys.locales || ['en'];
      let locale = ctx.route.locale;
      if (ctx.route.isDefaultLocale) {
        locale = getFallbackLocale(docLocales);
      } else {
        if (!docLocales.includes(locale)) {
          if (options.notFoundHook) {
            await options.notFoundHook(req, res);
            return;
          }
          res.setHeader('cache-control', 'private');
          return ctx.render404();
        }
      }

      const translations = shouldLoadTranslations
        ? batchResponse.getTranslations(locale)
        : {};
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

      if (options.disableCacheControl) {
        res.setHeader('cache-control', 'private');
      } else if (mode === 'published') {
        res.setHeader('cache-control', 'public, max-age=15, s-maxage=30');
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
      if (!options.slugParam) {
        return {paths: []};
      }
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      const mode = options.ssgMode || 'published';
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
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      const slug = getSlug(ctx.params);
      const mode = options.ssgMode || 'published';
      const siteLocales = ctx.rootConfig?.i18n?.locales || ['en'];
      const batchRequest = cmsClient.createBatchRequest({
        mode,
        translate: siteLocales.length > 1,
      });
      const routeContext: RouteContext = {
        req: undefined,
        slug,
        mode,
        cmsClient,
        params: ctx.params,
        batchRequest,
      };

      return generateProps(routeContext, ctx.params.$locale, siteLocales);
    };
  }

  return route;
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
 */
export function redirectWithQuery(
  req: Request,
  res: Response,
  redirectCode: number,
  redirectPath: string
) {
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
