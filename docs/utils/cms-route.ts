import {
  GetStaticPaths,
  GetStaticProps,
  HandlerContext,
  Request,
  Response,
  RouteParams,
} from '@blinkk/root';
import {RootCMSClient, translationsForLocale} from '@blinkk/root-cms/client';

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
   * Translations configuration.
   */
  translations?: (context: CMSRouteContext) => {tags?: string[]};

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
  sys?: {
    locales?: string[];
  };
}

export function cmsRoute(options: CMSRouteOptions) {
  let cmsClient: RootCMSClient = null;

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

  async function generateProps(routeContext: CMSRouteContext, locale: string) {
    const {slug, mode} = routeContext;
    const translationsTags = ['common', `${options.collection}/${slug}`];
    if (options.translations) {
      const tags = options.translations(routeContext)?.tags || [];
      translationsTags.push(...tags);
    }

    const [doc, translationsMap, data] = await Promise.all([
      cmsClient.getDoc<CMSDoc>(options.collection, slug, {
        mode,
      }),
      cmsClient.loadTranslations({tags: translationsTags}),
      fetchData(routeContext),
    ]);
    if (!doc) {
      return {notFound: true};
    }

    const translations = translationsForLocale(translationsMap, locale);
    let props: any = {...data, locale, mode, slug, doc};
    if (options.preRenderHook) {
      props = await options.preRenderHook(props, routeContext);
    }

    return {props, locale, translations};
  }

  // SSG handlers are disabled by default. Pass `{enableSSG: true}` to enable.
  let getStaticPaths: GetStaticPaths = null;
  let getStaticProps: GetStaticProps = null;

  if (options.enableSSG) {
    getStaticPaths = async (ctx) => {
      if (!options.slugParam) {
        return {paths: []};
      }
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      // TODO(stevenle): Add support for mode.
      const mode = 'published';
      const res = await cmsClient.listDocs(options.collection, {mode});
      const ssgPaths = [];
      res.docs.forEach((doc: {slug: string}) => {
        const params: Record<string, string> = {};
        params[options.slugParam] = doc.slug;
        ssgPaths.push({params});
      });
      return {paths: ssgPaths};
    };

    getStaticProps = async (ctx) => {
      if (!cmsClient) {
        cmsClient = new RootCMSClient(ctx.rootConfig);
      }
      const slug = getSlug(ctx.params);
      // TODO(stevenle): Add support for mode.
      const mode = 'published';
      const routeContext: CMSRouteContext = {req: null, slug, mode, cmsClient};

      return generateProps(routeContext, ctx.params.$locale);
    };
  }

  return {
    // SSG handlers (only enabled with `{enableSSG: true}`).
    getStaticPaths: getStaticPaths,
    getStaticProps: getStaticProps,

    // SSR handler.
    handle: async (req, res) => {
      if (!cmsClient) {
        cmsClient = new RootCMSClient(req.rootConfig);
      }
      req.cmsClient = cmsClient;
      const ctx = req.handlerContext as HandlerContext;
      const slug = getSlug(ctx.params);
      if (slug.includes('.')) {
        res.setHeader('cache-control', 'private');
        return ctx.render404();
      }
      const primaryDocId = `${options.collection}/${slug}`;
      const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
      const routeContext: CMSRouteContext = {req, slug, mode, cmsClient};

      const batchRequest = cmsClient.createBatchRequest({
        mode,
        translate: true,
      });
      batchRequest.addDoc(primaryDocId);

      const [batchRes, data] = await Promise.all([
        batchRequest.fetch(),
        fetchData(routeContext),
      ]);
      const doc = batchRes.docs[primaryDocId];

      if (!doc) {
        res.setHeader('cache-control', 'private');
        return ctx.render404();
      }

      const sys = doc.sys;
      const docLocales = sys.locales || ['en'];
      let locale = ctx.route.locale;
      if (ctx.route.isDefaultLocale) {
        locale = ctx.getPreferredLocale(docLocales);
        if (docLocales.length > 0 && !docLocales.includes(locale)) {
          locale = docLocales[0];
        }
      }
      const country =
        getFirstQueryParam(req, 'gl') ||
        req.get('x-country-code') ||
        req.get('x-appengine-country') ||
        null;

      const i18nFallbacks = req.rootConfig.i18n?.fallbacks || {};
      const translationFallbackLocales = i18nFallbacks[locale] || [locale];
      const translations = batchRes.getTranslations(translationFallbackLocales);
      let props: any = {
        ...data,
        req,
        locale,
        mode,
        slug,
        doc,
        country,
      };
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
