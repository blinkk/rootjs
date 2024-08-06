import crypto from 'node:crypto';
import {
  ComponentChildren,
  ComponentType,
  VNode,
  options as preactOptions,
} from 'preact';
import {renderToString} from 'preact-render-to-string';
import {HtmlContext, HTML_CONTEXT} from '../core/components/Html.js';
import {RootConfig, RootSecurityConfig} from '../core/config.js';
import {getTranslations, I18N_CONTEXT} from '../core/hooks/useI18nContext.js';
import {
  RequestContext,
  REQUEST_CONTEXT,
} from '../core/hooks/useRequestContext.js';
import {DevErrorPage} from '../core/pages/DevErrorPage.js';
import {DevNotFoundPage} from '../core/pages/DevNotFoundPage.js';
import {ErrorPage} from '../core/pages/ErrorPage.js';
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
import type {ElementGraph} from '../node/element-graph.js';
import {parseTagNames} from '../utils/elements.js';
import {toHrefLang} from '../utils/i18n.js';
import {AssetMap} from './asset-map/asset-map.js';
import {htmlMinify} from './html-minify.js';
import {htmlPretty} from './html-pretty.js';
import {getFallbackLocales} from './i18n-fallbacks.js';
import {normalizeUrlPath, replaceParams, Router} from './router.js';

interface RenderHtmlOptions {
  /** Attrs passed to the <html> tag, e.g. `{lang: 'en'}`. */
  htmlAttrs?: preact.JSX.HTMLAttributes<HTMLHtmlElement>;
  /** Attrs passed to the <head> tag. */
  headAttrs?: preact.JSX.HTMLAttributes<HTMLHeadElement>;
  /** Child components for the <head> tag. */
  headComponents?: ComponentChildren[];
  /** Attrs passed to the <body> tag. */
  bodyAttrs?: preact.JSX.HTMLAttributes<HTMLBodyElement>;
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

  async handle(req: Request, res: Response, next: NextFunction) {
    const url = req.path;
    const [route, routeParams] = this.router.get(url);
    if (!route) {
      next();
      return;
    }
    if (route.locale) {
      routeParams.$locale = route.locale;
    }

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

    const render404 = async () => {
      // Calling next() will allow the dev server or prod server handle the 404
      // page as appropriate for the env.
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
      const securityConfig = this.getSecurityConfig();
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
      });
      let html = output.html;
      if (this.rootConfig.prettyHtml) {
        html = await htmlPretty(html, this.rootConfig.prettyHtmlOptions);
      } else if (this.rootConfig.minifyHtml !== false) {
        html = await htmlMinify(html, this.rootConfig.minifyHtmlOptions);
      }
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
      let statusCode = 200;
      if (route.src === 'routes/404.tsx') {
        statusCode = 404;
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
      this.setSecurityHeaders(res, {
        securityConfig: securityConfig,
        nonce: nonce,
      });
      res.end(html);
    };

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
    const preactHook = preactOptions.vnode;
    let mainHtml = '';
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
      mainHtml = renderToString(vdom);
      preactOptions.vnode = preactHook;
    } catch (err) {
      preactOptions.vnode = preactHook;
      throw err;
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
        sitemap[routePath.urlPath] = sitemapItem;
      });
    });

    // Sort the sitemap by the urlPath and the hreflang alts by locale
    // (with x-default coming first).
    const orderedSitemap: Sitemap = {};
    Object.keys(sitemap)
      .sort()
      .forEach((urlPath: string) => {
        // console.log(urlPath);
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
        <body {...bodyAttrs} dangerouslySetInnerHTML={{__html: html}} />
      </html>
    );
    return `<!doctype html>\n${renderToString(page)}\n`;
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

    const mainHtml = renderToString(
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

    const mainHtml = renderToString(
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
    const mainHtml = renderToString(
      <DevNotFoundPage req={req} sitemap={sitemap} />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>404 Not found | Root.js</title>],
    });
    return {html};
  }

  async renderDevServer500(req: Request, error: unknown) {
    const [route, routeParams] = this.router.get(req.path);
    const mainHtml = renderToString(
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
   * Returns the `security` config value with default values inserted wherever
   * a user config value is blank or set to `true`.
   */
  private getSecurityConfig() {
    const userConfig: Partial<RootSecurityConfig> =
      this.rootConfig.server?.security || {};
    const securityConfig: Partial<RootSecurityConfig> = {};

    if (isTrueOrUndefined(userConfig.contentSecurityPolicy)) {
      // CSP default values from:
      // https://csp.withgoogle.com/docs/strict-csp.html
      securityConfig.contentSecurityPolicy = {
        directives: {
          'base-uri': ["'none'"],
          'object-src': ["'none'"],
          // NOTE: nonce is automatically added to this list.
          'script-src': [
            "'unsafe-inline'",
            "'unsafe-eval'",
            "'strict-dynamic' https: http:",
          ],
        },
        reportOnly: true,
      };
    } else {
      securityConfig.contentSecurityPolicy = userConfig.contentSecurityPolicy;
    }

    if (isTrueOrUndefined(userConfig.xFrameOptions)) {
      securityConfig.xFrameOptions = 'SAMEORIGIN';
    } else {
      securityConfig.xFrameOptions = userConfig.xFrameOptions;
    }

    securityConfig.strictTransportSecurity =
      userConfig.strictTransportSecurity ?? true;
    securityConfig.xContentTypeOptions = userConfig.xContentTypeOptions ?? true;
    securityConfig.xXssProtection = userConfig.xXssProtection ?? true;

    return securityConfig as Required<RootSecurityConfig>;
  }

  /**
   * Generates a random string that can be used as the "nonce" value for CSP.
   */
  private generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Sets security-related HTTP headers.
   */
  private setSecurityHeaders(
    res: Response,
    options: {securityConfig: Required<RootSecurityConfig>; nonce?: string}
  ) {
    const securityConfig = options.securityConfig;

    // Content-Security-Policy.
    const contentSecurityPolicy = securityConfig.contentSecurityPolicy;
    if (typeof contentSecurityPolicy === 'object') {
      const directives = contentSecurityPolicy.directives || {};
      if (options.nonce) {
        if (!directives['script-src']) {
          directives['script-src'] = [
            "'unsafe-inline'",
            "'unsafe-eval'",
            "'strict-dynamic' https: http:",
          ];
        }
        directives['script-src'].push(`'nonce-${options.nonce}'`);
      }
      const headerSegments: string[] = [];
      Object.entries(directives).forEach(([key, values]) => {
        headerSegments.push([key, ...values].join(' '));
      });
      const csp = headerSegments.join('; ');
      if (contentSecurityPolicy.reportOnly === false) {
        res.setHeader('content-security-policy', csp);
      } else {
        res.setHeader('content-security-policy-report-only', csp);
      }
    }

    // X-Frame-Options.
    if (typeof securityConfig.xFrameOptions === 'string') {
      res.setHeader('x-frame-options', securityConfig.xFrameOptions);
    }

    // Strict-Transport-Security.
    if (securityConfig.strictTransportSecurity) {
      res.setHeader(
        'strict-transport-security',
        'max-age=63072000; includeSubdomains; preload'
      );
    }

    // X-Content-Type-Options.
    if (securityConfig.xContentTypeOptions) {
      res.setHeader('x-content-type-options', 'nosniff');
    }

    // X-XSS-Protection.
    if (securityConfig.xXssProtection) {
      res.setHeader('x-xss-protection', '1; mode=block');
    }
  }
}

function isTrueOrUndefined(value: any) {
  return value === true || value === undefined;
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
