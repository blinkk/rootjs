import crypto from 'node:crypto';
import path from 'node:path';
import {
  ComponentChildren,
  ComponentType,
  VNode,
  options as preactOptions,
} from 'preact';
import {HtmlContext, HTML_CONTEXT} from '../core/components/Html.js';
import {RootConfig} from '../core/config.js';
import {getTranslations, I18N_CONTEXT} from '../core/hooks/useI18nContext.js';
import {
  RequestContext,
  REQUEST_CONTEXT,
} from '../core/hooks/useRequestContext.js';
import {DevErrorPage} from '../core/pages/DevErrorPage.js';
import {DevNotFoundPage} from '../core/pages/DevNotFoundPage.js';
import {ErrorPage} from '../core/pages/ErrorPage.js';
import {getSecurityConfig, setSecurityHeaders} from '../core/security.js';
import {
  Request,
  Response,
  NextFunction,
  HandlerContext,
  RouteParams,
  Route,
  HandlerRenderFn,
  HandlerRenderOptions,
  SitemapItem,
  Sitemap,
} from '../core/types.js';
import {JsxRenderOptions, renderJsxToString} from '../jsx/jsx-render.js';
import type {ElementGraph} from '../node/element-graph.js';
import {parseTagNames} from '../utils/elements.js';
import {toHrefLang} from '../utils/i18n.js';
import {replaceParams} from '../utils/url-path-params.js';
import {AssetMap} from './asset-map/asset-map.js';
import {transformHtml} from './html-transform.js';
import {getFallbackLocales} from './i18n-fallbacks.js';
import {normalizeUrlPath, Router} from './router.js';

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  xml: 'application/xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
};

interface RenderHtmlOptions {
  /** Attrs passed to the <html> tag, e.g. `{lang: 'en'}`. */
  htmlAttrs?: preact.JSX.HTMLAttributes<HTMLHtmlElement>;
  /** Attrs passed to the <head> tag. */
  headAttrs?: preact.JSX.HTMLAttributes<HTMLHeadElement>;
  /** Child components for the <head> tag. */
  headComponents?: ComponentChildren[];
  /** Attrs passed to the <body> tag. */
  bodyAttrs?: preact.JSX.HTMLAttributes<HTMLBodyElement>;
  /**
   * Overrides the JSX render mode. If not provided, defaults to the
   * `jsxRenderer.mode` specified in `root.config.ts`.
   */
  renderMode?: JsxRenderOptions['mode'];
}

export class Renderer {
  private rootConfig: RootConfig;
  // private routes: RouteTrie<Route>;
  private assetMap: AssetMap;
  private elementGraph: ElementGraph;
  private router: Router;

  constructor(
    rootConfig: RootConfig,
    options: {assetMap: AssetMap; elementGraph: ElementGraph}
  ) {
    this.rootConfig = rootConfig;
    // this.routes = getRoutes(this.rootConfig);
    this.assetMap = options.assetMap;
    this.elementGraph = options.elementGraph;
    this.router = new Router(rootConfig);
  }

  /** Returns a route from the router. */
  getRoute(url: string): [Route | undefined, Record<string, string>] {
    return this.router.get(url);
  }

  /** Returns all routes that match a given url path. */
  getRouteMatches(url: string): Array<[Route, Record<string, string>]> {
    return this.router.matchAll(url);
  }

  /** Walks all routes registered with the router. */
  async walkRoutes(
    cb: (urlPathFormat: string, route: Route) => void | Promise<void>
  ) {
    await this.router.walk(cb);
  }

  async handle(req: Request, res: Response, next: NextFunction) {
    let url = req.path;
    // Decode unicode paths.
    if (url.includes('%')) {
      try {
        url = decodeURI(url);
      } catch {
        // Intentionally ignored.
      }
    }

    const matches = this.router.matchAll(url);
    let matchIndex = 0;

    /** Callback handler that tries the next matching route. */
    const nextRouteHandler = async (): Promise<void> => {
      const match = matches[matchIndex++];
      if (!match) {
        next();
        return;
      }
      const [route, routeParams] = match;
      if (route.locale) {
        routeParams.$locale = route.locale;
      }
      await this.handleRoute(req, res, next, route, {
        routeParams,
        nextRouteHandler,
      });
    };
    await nextRouteHandler();
  }

  private async renderComponent(
    Component: ComponentType,
    props: any,
    options: {
      currentPath: string;
      route: Route;
      routeParams: RouteParams;
      locale: string;
      translations?: Record<string, string>;
      nonce?: string;
      renderMode?: JsxRenderOptions['mode'];
    }
  ) {
    const {currentPath, route, routeParams, nonce} = options;
    const locale = options.locale;
    const translations = {
      ...getTranslations(locale),
      ...(options.translations || {}),
    };
    const ctx: RequestContext = {
      currentPath,
      route,
      props,
      routeParams,
      locale,
      translations,
      nonce,
    };
    const htmlContext: HtmlContext = {
      htmlAttrs: {},
      headAttrs: {},
      headComponents: [],
      bodyAttrs: {},
      scriptDeps: [],
    };
    const vdom = (
      <REQUEST_CONTEXT.Provider value={ctx}>
        <I18N_CONTEXT.Provider value={{locale, translations}}>
          <HTML_CONTEXT.Provider value={htmlContext}>
            <Component {...props} />
          </HTML_CONTEXT.Provider>
        </I18N_CONTEXT.Provider>
      </REQUEST_CONTEXT.Provider>
    );

    // Create a hook to auto-inject nonce values.
    // https://preactjs.com/guide/v10/options/
    // NOTE: `preactOptions.vnode` is a global, so the hook must be installed
    // and restored within a single synchronous block. Resolve the JSX
    // renderer first (which may involve a dynamic import) so that no `await`
    // occurs while the hook is swapped. Awaiting inside the swapped window
    // allows concurrent renders to interleave, leaking a stale hook (and its
    // nonce) into other requests.
    const renderJsxFn = await this.getJsxRenderFn({mode: options.renderMode});
    const preactHook = preactOptions.vnode;
    let mainHtml: string;
    try {
      preactOptions.vnode = (vnode: VNode<any>) => {
        // Inject nonce to `<script>` tags.
        if (vnode && vnode.type === 'script') {
          vnode.props.nonce = nonce;
        }
        // Inject nonce to `<style>` tags.
        if (vnode && vnode.type === 'style') {
          vnode.props.nonce = nonce;
        }
        // Inject nonce to `<link rel="stylesheet">` tags.
        if (
          vnode &&
          vnode.type === 'link' &&
          vnode.props.rel === 'stylesheet'
        ) {
          vnode.props.nonce = nonce;
        }
        // Call the normal preact hook.
        if (preactHook) {
          preactHook(vnode);
        }
      };
      mainHtml = renderJsxFn(vdom);
    } finally {
      preactOptions.vnode = preactHook;
    }

    const jsDeps = new Set<string>();
    const cssDeps = new Set<string>();

    // Walk the route's dependency tree for CSS dependencies that are added via
    // `import 'foo.scss'` or `import 'foo.module.scss'`.
    const routeAsset = await this.assetMap.get(route.src);
    if (routeAsset) {
      const routeCssDeps = await routeAsset.getCssDeps();
      routeCssDeps.forEach((dep) => {
        // Ignore ?inline css deps.
        if (dep.endsWith('?inline')) {
          return;
        }
        cssDeps.add(dep);
      });
    }

    // Merge user-configured stylesheet entries first. This allows global
    // entries to appear before auto-collected stylesheets.
    this.getConfiguredStyleEntries().forEach((styleEntry) => {
      cssDeps.add(styleEntry);
    });

    // Parse the HTML for custom elements that are found within the project
    // and automatically inject the script deps for them.
    await this.collectElementDeps(mainHtml, jsDeps, cssDeps);

    // Add user defined scripts added via the `<Script>` component.
    await Promise.all(
      htmlContext.scriptDeps.map(async (scriptDep) => {
        if (!scriptDep.src) {
          return;
        }
        const assetId = String(scriptDep.src).slice(1);
        const scriptAsset = await this.assetMap.get(assetId);
        if (scriptAsset) {
          jsDeps.add(scriptAsset.assetUrl);
          const scriptJsDeps = await scriptAsset.getJsDeps();
          scriptJsDeps.forEach((dep) => jsDeps.add(dep));
        }
      })
    );

    const styleTags = Array.from(cssDeps).map((cssUrl) => {
      return <link rel="stylesheet" href={cssUrl} nonce={nonce} />;
    });
    const scriptTags = Array.from(jsDeps).map((jsUrls) => {
      // TODO(stevenle): after verifying this doesn't cause any negative side
      // effects, make async the default.
      if (this.rootConfig.experiments?.enableScriptAsync) {
        return <script type="module" src={jsUrls} nonce={nonce} async />;
      }
      return <script type="module" src={jsUrls} nonce={nonce} />;
    });

    const html = await this.renderHtml(mainHtml, {
      htmlAttrs: htmlContext.htmlAttrs,
      headAttrs: htmlContext.headAttrs,
      bodyAttrs: htmlContext.bodyAttrs,
      headComponents: [
        ...htmlContext.headComponents,
        ...styleTags,
        ...scriptTags,
      ],
      renderMode: options.renderMode,
    });
    return {html};
  }

  /** SSG renders a route. */
  async renderRoute(
    route: Route,
    options: {routeParams: Record<string, string>}
  ): Promise<{html?: string; notFound?: boolean}> {
    const routeParams = options.routeParams;
    if (route.locale) {
      routeParams.$locale = route.locale;
    }
    const Component = route.module.default;
    if (!Component) {
      throw new Error(
        'unable to render route. the route should have a default export that renders a jsx component.'
      );
    }
    let props = {};
    let locale = route.locale;
    let translations = undefined;
    if (route.module.getStaticProps) {
      const propsData = await route.module.getStaticProps({
        rootConfig: this.rootConfig,
        params: routeParams,
      });
      if (propsData.notFound) {
        return {notFound: true};
      }
      if (propsData.props) {
        props = propsData.props;
      }
      if (propsData.locale) {
        locale = propsData.locale;
      }
      if (propsData.translations) {
        translations = propsData.translations;
      }
    }
    const routePath = route.isDefaultLocale
      ? route.routePath
      : route.localeRoutePath;
    const currentPath = replaceParams(routePath, {
      ...routeParams,
      locale: locale,
    });
    return this.renderComponent(Component, props, {
      currentPath,
      route,
      routeParams,
      locale,
      translations,
    });
  }

  /** Handles the SSR rendering of a route. */
  async handleRoute(
    req: Request,
    res: Response,
    next: NextFunction,
    route: Route,
    options?: {
      defaultStatusCode?: number;
      /**
       * URL placeholder params.
       */
      routeParams?: Record<string, string>;
      /**
       * Handler function that tries the next matching route if multiple routes
       * match for a given url path.
       */
      nextRouteHandler?: () => void | Promise<void>;
    }
  ) {
    const defaultStatusCode = options?.defaultStatusCode || 200;
    const routeParams = options?.routeParams || {};
    const nextRouteHandler = options?.nextRouteHandler;

    const fallbackLocales = route.isDefaultLocale
      ? getFallbackLocales(req)
      : [route.locale];
    const getPreferredLocale = (availableLocales: string[]) => {
      const lowerLocales = availableLocales.map((l) => l.toLowerCase());
      for (const fallbackLocale of fallbackLocales) {
        if (lowerLocales.includes(fallbackLocale.toLowerCase())) {
          return fallbackLocale;
        }
      }
      return req.rootConfig?.i18n?.defaultLocale || 'en';
    };

    const render404 = async (options?: {nextRoute?: boolean}) => {
      // Calling next() will allow the dev server or prod server handle the 404
      // page as appropriate for the env. When nextRoute is true, attempt to
      // handle the request with the next matching route instead.
      if (options?.nextRoute && nextRouteHandler) {
        await nextRouteHandler();
        return;
      }
      // Ensure 404 responses are never cached by CDNs.
      if (!res.getHeader('cache-control')) {
        res.setHeader('cache-control', 'private');
      }
      next();
    };

    const render: HandlerRenderFn = async (
      props: any,
      options?: HandlerRenderOptions
    ) => {
      if (!route.module.default) {
        console.error(`no default component exported in route: ${route.src}`);
        render404();
        return;
      }
      const securityConfig = getSecurityConfig(this.rootConfig);
      const cspEnabled = !!securityConfig.contentSecurityPolicy;
      const currentPath = req.path;
      const locale = options?.locale || route.locale;
      const translations = options?.translations;
      const nonce = cspEnabled ? this.generateNonce() : undefined;
      const output = await this.renderComponent(route.module.default, props, {
        currentPath,
        route,
        routeParams,
        locale,
        translations,
        nonce,
        renderMode: options?.renderMode,
      });

      let html = await transformHtml(output.html, this.rootConfig);
      if (req.viteServer) {
        html = await req.viteServer.transformIndexHtml(currentPath, html);
        if (nonce) {
          html = html.replace(
            '<script type="module" src="/@vite/client"></script>',
            `<script type="module" src="/@vite/client" nonce="${nonce}"></script>`
          );
        }
      }

      // Override the status code for 404 and 500 routes, which are defined at
      // routes/404.tsx and routes/500.tsx respectively.
      let statusCode = options?.statusCode || defaultStatusCode;
      if (route.src === 'routes/404.tsx') {
        statusCode = 404;
      } else if (route.src === 'routes/401.tsx') {
        statusCode = 401;
      } else if (route.src === 'routes/500.tsx') {
        statusCode = 500;
      }

      // Trigger preRender hooks.
      req.hooks.trigger('preRender');
      const plugins = this.rootConfig.plugins || [];
      for (const plugin of plugins) {
        if (plugin.hooks?.preRender) {
          const newHtml = await plugin.hooks.preRender(html);
          if (newHtml && typeof newHtml === 'string') {
            html = newHtml;
          }
        }
      }

      res.status(statusCode);
      res.set({'Content-Type': 'text/html'});
      setSecurityHeaders(res, {
        securityConfig: securityConfig,
        nonce: nonce,
      });
      res.end(html);
    };

    if (route.module.getStaticContent) {
      let props: any;
      if (route.module.getStaticProps) {
        props = await route.module.getStaticProps({
          rootConfig: this.rootConfig,
          params: routeParams,
        });
        if (props?.notFound) {
          return render404();
        }
      } else {
        props = {rootConfig: this.rootConfig, params: routeParams};
      }
      const result = await route.module.getStaticContent(props);
      let body: string | Buffer;
      let contentType: string | undefined;
      if (typeof result === 'string' || Buffer.isBuffer(result)) {
        body = result;
      } else if (result && typeof result === 'object') {
        body = result.body;
        contentType = result.contentType;
      } else {
        body = '';
      }
      res.status(defaultStatusCode);
      const ext = path.extname(route.routePath);
      res.set({
        'Content-Type': contentType || guessContentType(ext),
      });
      res.end(body);
      return;
    }

    if (route.module.handle) {
      const handlerContext: HandlerContext = {
        route: route,
        params: routeParams,
        i18nFallbackLocales: fallbackLocales,
        getPreferredLocale: getPreferredLocale,
        render: render,
        render404: render404,
      };
      req.handlerContext = handlerContext;
      return route.module.handle(req, res, next);
    }

    let props = {};
    if (route.module.getStaticProps) {
      const propsData = await route.module.getStaticProps({
        rootConfig: this.rootConfig,
        params: routeParams,
      });
      if (propsData.notFound) {
        return render404();
      }
      if (propsData.props) {
        props = propsData.props;
      }
    }
    await render(props);
    return;
  }

  /**
   * Constructs and returns the project's sitemap.
   *
   * The sitemap is used to:
   * - determine all paths to build in SSG mode
   * - display links on the dev server's 404 page
   * - construct alternates for localized URL paths
   */
  async getSitemap(): Promise<Sitemap> {
    const sitemap: Sitemap = {};
    const sitemapItemAlts: Record<
      string,
      Record<string, {hrefLang: string; urlPath: string}>
    > = {};
    const trailingSlash = this.rootConfig.server?.trailingSlash || false;

    await this.router.walk(async (urlPath: string, route: Route) => {
      const routePaths = await this.router.getAllPathsForRoute(urlPath, route);
      routePaths.forEach((routePath) => {
        const routeLocale = route.isDefaultLocale ? 'x-default' : route.locale;
        const hrefLang = route.isDefaultLocale
          ? 'x-default'
          : toHrefLang(route.locale);
        const defaultUrlPath = normalizeUrlPath(
          replaceParams(route.routePath, routePath.params),
          {trailingSlash: trailingSlash}
        );
        if (!sitemapItemAlts[defaultUrlPath]) {
          sitemapItemAlts[defaultUrlPath] = {};
        }
        sitemapItemAlts[defaultUrlPath][routeLocale] = {
          hrefLang: hrefLang,
          urlPath: normalizeUrlPath(replaceParams(urlPath, routePath.params), {
            trailingSlash: trailingSlash,
          }),
        };
        const sitemapItem: SitemapItem = {
          urlPath: routePath.urlPath,
          route,
          params: routePath.params,
          locale: routeLocale,
          hrefLang: hrefLang,
          alts: sitemapItemAlts[defaultUrlPath],
        };
        if (sitemap[routePath.urlPath]) {
          console.warn(
            `multiple routes generate the same path: ${routePath.urlPath}. ensure each route generates a unique path.`
          );
        }
        sitemap[routePath.urlPath] = sitemapItem;
      });
    });

    // Sort the sitemap by the urlPath and the hreflang alts by locale
    // (with x-default coming first).
    const orderedSitemap: Sitemap = {};
    Object.keys(sitemap)
      .sort()
      .forEach((urlPath: string) => {
        const sitemapItem = sitemap[urlPath];
        const orderedAlts: Record<string, {hrefLang: string; urlPath: string}> =
          {};
        Object.keys(sitemapItem.alts)
          .sort(sortLocales)
          .forEach((locale) => {
            orderedAlts[locale] = sitemapItem.alts[locale];
          });
        sitemapItem.alts = orderedAlts;
        orderedSitemap[urlPath] = sitemapItem;
      });
    return orderedSitemap;
  }

  private getJsxRenderOptions(): JsxRenderOptions {
    return this.rootConfig.jsxRenderer || {};
  }

  /**
   * Resolves a synchronous JSX render function, using either the
   * `@blinkk/root/jsx` package or `preact-render-to-string` depending if the
   * `jsxRenderer` config is set up in `root.config.ts`.
   *
   * A `mode` override may be passed to render in a specific mode for a single
   * render, overriding the `jsxRenderer.mode` from `root.config.ts`.
   *
   * Resolving the renderer up front (rather than awaiting inside the render
   * call) allows callers that temporarily swap global state (e.g. the
   * `preact.options.vnode` nonce hook) to render synchronously without
   * yielding to the event loop.
   */
  private async getJsxRenderFn(renderOptions?: {
    mode?: JsxRenderOptions['mode'];
  }): Promise<(vnode: any) => string> {
    // Use the per-render mode override if provided, otherwise fall back to the
    // mode specified by the `jsxRenderer` config in `root.config.ts`.
    const mode = renderOptions?.mode ?? this.rootConfig.jsxRenderer?.mode;
    if (mode) {
      const options = {...this.getJsxRenderOptions(), mode};
      return (vnode: any) => renderJsxToString(vnode, options);
    }
    const {renderToString} = await import('preact-render-to-string');
    if (!renderToString) {
      throw new Error(
        'failed to render jsx. either install preact-render-to-string or add the "jsxRenderer" config to root.config.ts'
      );
    }
    return (vnode: any) => renderToString(vnode);
  }

  /**
   * Renders JSX via either the `@blinkk/root/jsx` package or
   * `preact-render-to-string` depending if the `jsxRenderer` config is set up
   * in `root.config.ts`.
   */
  private async renderJsx(
    vnode: any,
    options?: {mode?: JsxRenderOptions['mode']}
  ) {
    const render = await this.getJsxRenderFn(options);
    return render(vnode);
  }

  private getConfiguredStyleEntries() {
    const styleEntries = this.rootConfig.styles?.entries || [];
    const basePath = this.rootConfig.base || '/';
    return styleEntries
      .map((entry) => entry.trim())
      .filter((entry) => entry)
      .map((entry) => normalizeStyleEntry(entry, basePath));
  }

  private async renderHtml(html: string, options?: RenderHtmlOptions) {
    const htmlAttrs = options?.htmlAttrs || {};
    const headAttrs = options?.headAttrs || {};
    const bodyAttrs = options?.bodyAttrs || {};
    const page = (
      <html {...htmlAttrs}>
        <head {...headAttrs}>
          <meta charSet="utf-8" />
          {options?.headComponents}
        </head>
        <body
          {...bodyAttrs}
          dangerouslySetInnerHTML={{__html: this.ensureNewline(html)}}
        />
      </html>
    );
    const content = await this.renderJsx(page, {mode: options?.renderMode});
    return `<!doctype html>\n${content}`;
  }

  private ensureNewline(str: string) {
    if (!str.endsWith('\n')) {
      return str + '\n';
    }
    return str;
  }

  async render404(options?: {currentPath?: string}) {
    const basePath = this.rootConfig.base || '/';
    const notFoundPath = normalizeUrlPath(`${basePath}/404`);
    const currentPath = options?.currentPath || notFoundPath;
    const [route, routeParams] = this.router.get(notFoundPath);
    if (route && route.src === 'routes/404.tsx' && route.module.default) {
      const Component = route.module.default;
      return this.renderComponent(
        Component,
        {},
        {currentPath, route, routeParams, locale: 'en'}
      );
    }

    const mainHtml = await this.renderJsx(
      <ErrorPage
        code={404}
        title="Not found"
        message="Double-check the URL entered and try again."
        align="center"
      />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [
        <title>404 Not Found</title>,
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />,
      ],
    });
    return {html};
  }

  async renderError(err: any, options?: {currentPath?: string}) {
    const currentPath = options?.currentPath || '/500';
    const [route, routeParams] = this.router.get('/500');
    if (route && route.src === 'routes/500.tsx' && route.module.default) {
      const Component = route.module.default;
      return this.renderComponent(
        Component,
        {error: err},
        {currentPath, route, routeParams, locale: 'en'}
      );
    }

    const mainHtml = await this.renderJsx(
      <ErrorPage
        code={500}
        title="Something went wrong"
        message="An unknown error occurred."
        align="center"
      />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [
        <title>500 Error</title>,
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />,
      ],
    });
    return {html};
  }

  async renderDevServer404(req: Request) {
    const sitemap = await this.getSitemap();
    const mainHtml = await this.renderJsx(
      <DevNotFoundPage req={req} sitemap={sitemap} />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>404 Not found | Root.js</title>],
    });
    return {html};
  }

  async renderDevServer500(req: Request, error: unknown) {
    const [route, routeParams] = this.router.get(req.path);
    const mainHtml = await this.renderJsx(
      <DevErrorPage
        req={req}
        route={route}
        routeParams={routeParams}
        error={error}
      />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>500 Error | Root.js</title>],
    });
    return {html};
  }

  /**
   * Parses rendered HTML for custom element tags used on the page and
   * automatically adds the JS/CSS deps to the page.
   */
  private async collectElementDeps(
    html: string,
    jsDeps: Set<string>,
    cssDeps: Set<string>
  ): Promise<{jsDeps: Set<string>; cssDeps: Set<string>}> {
    const elementsMap = this.elementGraph.sourceFiles;
    const assetMap = this.assetMap;

    const tagNames = new Set<string>();
    for (const tagName of parseTagNames(html)) {
      if (tagName && tagName in elementsMap) {
        tagNames.add(tagName);
        for (const depTagName of this.elementGraph.getDeps(tagName)) {
          tagNames.add(depTagName);
        }
      }
    }

    await Promise.all(
      Array.from(tagNames).map(async (tagName: string) => {
        const elementModule = elementsMap[tagName];
        const asset = await assetMap.get(elementModule.relPath);
        if (!asset) {
          return;
        }
        const assetJsDeps = await asset.getJsDeps();
        assetJsDeps.forEach((dep) => jsDeps.add(dep));
        const assetCssDeps = await asset.getCssDeps();
        assetCssDeps.forEach((dep) => {
          // Ignore ?inline css deps.
          if (dep.endsWith('?inline')) {
            return;
          }
          cssDeps.add(dep);
        });
      })
    );

    return {jsDeps, cssDeps};
  }

  /**
   * Generates a random string that can be used as the "nonce" value for CSP.
   */
  private generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }
}

function sortLocales(a: string, b: string) {
  if (a === 'x-default') {
    return -1;
  }
  if (b === 'x-default') {
    return 1;
  }
  return a.localeCompare(b);
}

function normalizeStyleEntry(entry: string, basePath: string) {
  const normalizedEntry = normalizeUrlPath(entry.replace(/^\.\//, ''));
  return normalizeUrlPath(`${basePath}/${normalizedEntry}`);
}

function guessContentType(ext: string): string {
  const normalized = ext.trim().toLowerCase().replace(/^\./, '');
  return CONTENT_TYPES[normalized] || 'application/octet-stream';
}
