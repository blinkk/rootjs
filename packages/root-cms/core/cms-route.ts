import {
  GetStaticPaths,
  GetStaticProps,
  HandlerContext,
  Request,
  Response,
  RouteParams,
} from '@blinkk/root';
import {BatchRequest, RootCMSClient} from './client.js';

export type CMSRequest = Request & {
  cmsClient: RootCMSClient;
};

export interface CMSRouteContext {
  /** HTTP request object. Only available in SSR mode. */
  req?: CMSRequest;
  slug: string;
  mode: 'draft' | 'published';
  cmsClient: RootCMSClient;
}

export interface CMSRouteOptions {
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
   * Slug to use for the route. Used for non-dynamic, single-document routes.
   */
  slug?: string;

  /**
   * Hook that allows callers to modify the Root CMS `BatchRequest` object. If a
   * new `BatchRequest` is returned, it will replace the default one created by
   * `cmsRoute()`.
   */
  preRequestHook?: (
    batchRequest: BatchRequest,
    context: CMSRouteContext
  ) => void | BatchRequest;

  /**
   * Callback function that returns a map of Promises that contain fetched data.
   * Once the promise is resolved, the values are injected into page's props
   * for rendering.
   */
  fetchData?: (context: CMSRouteContext) => Record<string, Promise<any>>;

  /**
   * Hook for amending any props values before being passed to the page
   * component.
   */
  preRenderHook?: (props: any, context: CMSRouteContext) => any | Promise<any>;

  /**
   * Hook for setting any response headers.
   */
  setResponseHeaders?: (req: Request, res: Response) => void;

  /**
   * Sets Cache-Control header to `private`.
   */
  disableCacheControl?: boolean;

  /**
   * Enables SSG mode for sites that serve on SCS or other static servers.
   */
  enableSSG?: boolean;
}

export interface CMSDoc {
  id: string;
  slug: string;
  sys?: {
    locales?: string[];
  };
}

/**
 * Utility for generating SSR and SSG handlers in a Root route file.
 */
export function cmsRoute(options: CMSRouteOptions) {
  let cmsClient: RootCMSClient | null = null;

  function getSlug(params: RouteParams) {
    if (options.slug) {
      return options.slug;
    }
    const slugParam = options.slugParam || 'slug';
    return (params[slugParam] || 'index').replaceAll('/', '--');
  }

  async function fetchData(
    fetchOptions: CMSRouteContext
  ): Promise<Record<string, any>> {
    if (!options.fetchData) {
      return {};
    }
    const promisesMap = options.fetchData(fetchOptions);
    return resolvePromisesMap(promisesMap);
  }

  async function generateProps(
    routeContext: CMSRouteContext,
    preferredLocale: string | ((doc: CMSDoc) => string)
  ) {
    const {slug, mode} = routeContext;

    const primaryDocId = `${options.collection}/${slug}`;
    let batchRequest = routeContext.cmsClient.createBatchRequest({
      mode,
      translate: true,
    });
    batchRequest.addDoc(primaryDocId);

    // Call the pre-request hook to allow users to modify the batch request.
    if (options.preRequestHook) {
      const overridedBatchRequest = options.preRequestHook(
        batchRequest,
        routeContext
      );
      if (overridedBatchRequest) {
        batchRequest = overridedBatchRequest;
      }
    }

    // Fetch the Root CMS BatchRequest in parallel with any other data the
    // caller needs to fetch to render the route.
    const [batchRes, data] = await Promise.all([
      batchRequest.fetch(),
      fetchData(routeContext),
    ]);
    const doc = batchRes.docs[primaryDocId];
    if (!doc) {
      return {notFound: true};
    }

    // Determine the preferred locale to render.
    let locale: string;
    if (typeof preferredLocale === 'string') {
      locale = preferredLocale;
    } else {
      locale = preferredLocale(doc);
    }
    const docLocales = doc.sys?.locales || ['en'];
    if (!locale || !docLocales.includes(locale)) {
      return {notFound: true};
    }

    // From the preferred locale, generate a translations map.
    const i18nFallbacks =
      routeContext.cmsClient.rootConfig.i18n?.fallbacks || {};
    const translationFallbackLocales = i18nFallbacks[locale] || [locale];
    const translations = batchRes.getTranslations(translationFallbackLocales);

    let props: any = {...data, locale, mode, slug, doc};

    // For SSR handlers, inject the user's country of origin to props.
    if (routeContext.req) {
      const country =
        getFirstQueryParam(routeContext.req, 'gl') ||
        routeContext.req.get('x-country-code') ||
        routeContext.req.get('x-appengine-country') ||
        null;
      props.country = country;
    }

    // Call the pre-render hook which allows a caller to modify props before
    // it is passed to the route component.
    if (options.preRenderHook) {
      props = await options.preRenderHook(props, routeContext);
    }

    return {props, locale, translations};
  }

  // SSG handlers are disabled by default. Pass `{enableSSG: true}` to enable.
  let getStaticPaths: GetStaticPaths | null = null;
  let getStaticProps: GetStaticProps | null = null;

  if (options.enableSSG) {
    getStaticPaths = async (ctx) => {
      if (!options.slugParam) {
        return {paths: []};
      }
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      const mode = 'published';
      const res = await cmsClient.listDocs<CMSDoc>(options.collection, {mode});
      const ssgPaths: Array<{params: Record<string, string>}> = [];
      res.docs.forEach((doc) => {
        const params: Record<string, string> = {};
        params[options.slugParam!] = doc.slug;
        ssgPaths.push({params});
      });
      return {paths: ssgPaths};
    };

    getStaticProps = async (ctx) => {
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      const slug = getSlug(ctx.params);
      const mode = 'published';
      const routeContext: CMSRouteContext = {slug, mode, cmsClient};
      return generateProps(routeContext, ctx.params.$locale);
    };
  }

  return {
    // SSG handlers (only enabled with `{enableSSG: true}`).
    getStaticPaths: getStaticPaths,
    getStaticProps: getStaticProps,

    // SSR handler.
    handle: async (req: CMSRequest, res: Response) => {
      if (!cmsClient) {
        cmsClient = new RootCMSClient(req.rootConfig!);
      }
      req.cmsClient = cmsClient;
      const ctx = req.handlerContext as HandlerContext;
      const slug = getSlug(ctx.params);
      if (slug.includes('.')) {
        res.setHeader('cache-control', 'private');
        return ctx.render404();
      }
      const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
      const routeContext: CMSRouteContext = {req, slug, mode, cmsClient};

      function getLocale(doc: CMSDoc) {
        const docLocales = doc.sys?.locales || ['en'];
        let locale = ctx.route.locale;
        if (ctx.route.isDefaultLocale) {
          locale = ctx.getPreferredLocale(docLocales);
          if (docLocales.length > 0 && !docLocales.includes(locale)) {
            locale = docLocales[0];
          }
        }
        return locale;
      }

      const resData = await generateProps(routeContext, getLocale);
      if (resData.notFound) {
        res.setHeader('cache-control', 'private');
        return ctx.render404();
      }

      const {props, locale, translations} = resData;

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
          res.setHeader('vary', 'accept-language, x-country-code');
        }
      }
      if (options.setResponseHeaders) {
        options.setResponseHeaders(req, res);
      }
      return ctx.render(props, {locale, translations});
    },
  };
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
function getFirstQueryParam(req: Request, key: string): string | null {
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
