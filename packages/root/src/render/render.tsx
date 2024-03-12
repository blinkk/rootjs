import crypto from 'node:crypto';
import {ComponentChildren, ComponentType} from 'preact';
import renderToString from 'preact-render-to-string';
import {HtmlContext, HTML_CONTEXT} from '../core/components/Html';
import {RootConfig} from '../core/config';
import {getTranslations, I18N_CONTEXT} from '../core/hooks/useI18nContext';
import {RequestContext, REQUEST_CONTEXT} from '../core/hooks/useRequestContext';
import {DevErrorPage} from '../core/pages/DevErrorPage';
import {DevNotFoundPage} from '../core/pages/DevNotFoundPage';
import {ErrorPage} from '../core/pages/ErrorPage';
import {
  Request,
  Response,
  NextFunction,
  HandlerContext,
  RouteParams,
  Route,
  HandlerRenderFn,
  HandlerRenderOptions,
} from '../core/types';
import type {ElementGraph} from '../node/element-graph';
import {parseTagNames} from '../utils/elements';
import {AssetMap} from './asset-map/asset-map';
import {htmlMinify} from './html-minify';
import {htmlPretty} from './html-pretty';
import {getFallbackLocales} from './i18n-fallbacks';
import {replaceParams, Router} from './router';

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
      const currentPath = req.path;
      const locale = options?.locale || route.locale;
      const translations = options?.translations;
      const nonce = this.rootConfig.server?.csp
        ? this.generateNonce()
        : undefined;
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
      }
      // Override the status code for 404 and 500 routes, which are defined at
      // routes/404.tsx and routes/500.tsx respectively.
      let statusCode = 200;
      if (route.src === 'routes/404.tsx') {
        statusCode = 404;
      } else if (route.src === 'routes/500.tsx') {
        statusCode = 500;
      }
      req.hooks.trigger('preRender');
      res.status(statusCode);
      res.set({'Content-Type': 'text/html'});
      if (this.rootConfig.server?.csp) {
        this.setCspHeaders(res, {nonce: nonce!});
      }
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
    const mainHtml = renderToString(vdom);

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

    const nonceAttr: Record<string, string> = {};
    if (nonce) {
      nonceAttr.nonce = nonce;
    }

    const styleTags = Array.from(cssDeps).map((cssUrl) => {
      return <link rel="stylesheet" href={cssUrl} {...nonceAttr} />;
    });
    const scriptTags = Array.from(jsDeps).map((jsUrls) => {
      return <script type="module" src={jsUrls} {...nonceAttr} />;
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

  async getSitemap(): Promise<
    Record<string, {route: Route; params: Record<string, string>}>
  > {
    const sitemap: Record<
      string,
      {route: Route; params: Record<string, string>}
    > = {};
    await this.router.walk(async (urlPath: string, route: Route) => {
      const routePaths = await this.router.getAllPathsForRoute(urlPath, route);
      routePaths.forEach((routePath) => {
        sitemap[routePath.urlPath] = {
          route,
          params: routePath.params,
        };
      });
    });
    return sitemap;
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
    const currentPath = options?.currentPath || '/404';
    const [route, routeParams] = this.router.get('/404');
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
   * Generates a random string that can be used as the "nonce" value for CSP.
   */
  private generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Sets CSP headers.
   */
  private setCspHeaders(res: Response, options: {nonce: string}) {
    const nonce = options.nonce;
    // TODO(stevenle): impl.
  }
}
