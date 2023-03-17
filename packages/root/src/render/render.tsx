import {ComponentChildren, ComponentType} from 'preact';
import renderToString from 'preact-render-to-string';
import {getRoutes, getAllPathsForRoute} from './router';
import {ErrorPage} from '../core/pages/ErrorPage';
import {AssetMap} from './asset-map/asset-map';
import {RootConfig} from '../core/config';
import {RouteTrie} from './route-trie';
import {DevNotFoundPage} from '../core/pages/DevNotFoundPage';
import {HtmlContext, HTML_CONTEXT} from '../core/components/Html';
import {
  Request,
  Response,
  NextFunction,
  HandlerContext,
  RouteParams,
  Route,
} from '../core/types';
import {htmlMinify} from './html-minify';
import {htmlPretty} from './html-pretty';
import {DevErrorPage} from '../core/pages/DevErrorPage';
import {RequestContext, REQUEST_CONTEXT} from '../core/hooks/useRequestContext';
import {getTranslations, I18N_CONTEXT} from '../core/hooks/useI18nContext';
import type {ElementGraph} from '../core/element-graph';
import {parseTagNames} from '../utils/elements';

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
  private routes: RouteTrie<Route>;
  private assetMap: AssetMap;
  private elementGraph: ElementGraph;

  constructor(
    rootConfig: RootConfig,
    options: {assetMap: AssetMap; elementGraph: ElementGraph}
  ) {
    this.rootConfig = rootConfig;
    this.routes = getRoutes(this.rootConfig);
    this.assetMap = options.assetMap;
    this.elementGraph = options.elementGraph;
  }

  // async render(url: string): Promise<{html?: string; notFound?: boolean}> {
  //   const [route, routeParams] = this.routes.get(url);
  //   if (route && route.module && route.module.default) {
  //     return await this.renderRoute(route, {routeParams});
  //   }
  //   return {notFound: true};
  // }

  async handle(req: Request, res: Response, next: NextFunction) {
    // TODO(stevenle): handle baseUrl config.
    const url = req.path;
    const [route, routeParams] = this.routes.get(url);
    if (!route) {
      next();
      return;
    }

    const render404 = async () => {
      // Calling next() will allow the dev server or prod server handle the 404
      // page as appropriate for the env.
      next();
    };

    const render = async (props: any) => {
      if (!route.module.default) {
        console.error(`no default component exported in route: ${route.src}`);
        render404();
        return;
      }
      const output = await this.renderComponent(route.module.default, props, {
        route,
        routeParams,
      });
      let html = output.html;
      if (this.rootConfig.prettyHtml) {
        html = await htmlPretty(html, this.rootConfig.prettyHtmlOptions);
      } else if (this.rootConfig.minifyHtml !== false) {
        html = await htmlMinify(html, this.rootConfig.minifyHtmlOptions);
      }
      res.status(200).set({'Content-Type': 'text/html'}).end(html);
    };

    if (route.module.handle) {
      const handlerContext: HandlerContext = {
        route: route,
        params: routeParams,
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
    options: {route: Route; routeParams: RouteParams}
  ) {
    const {route, routeParams} = options;
    const locale = route.locale;
    const translations = getTranslations(locale);
    const ctx: RequestContext = {
      route,
      props,
      routeParams,
      locale,
      translations,
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
      routeCssDeps.forEach((dep) => cssDeps.add(dep));
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
        const scriptAsset = await this.assetMap.get(scriptDep.src.slice(1));
        if (scriptAsset) {
          jsDeps.add(scriptAsset.assetUrl);
          const scriptJsDeps = await scriptAsset.getJsDeps();
          scriptJsDeps.forEach((dep) => jsDeps.add(dep));
        }
      })
    );

    const styleTags = Array.from(cssDeps).map((cssUrl) => {
      return <link rel="stylesheet" href={cssUrl} />;
    });
    const scriptTags = Array.from(jsDeps).map((jsUrls) => {
      return <script type="module" src={jsUrls} />;
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
    const Component = route.module.default;
    if (!Component) {
      throw new Error(
        'unable to render route. the route should have a default export that renders a jsx component.'
      );
    }
    let props = {};
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
    }
    return this.renderComponent(Component, props, {route, routeParams});
  }

  async getSitemap(): Promise<
    Record<string, {route: Route; params: Record<string, string>}>
  > {
    const sitemap: Record<
      string,
      {route: Route; params: Record<string, string>}
    > = {};
    await this.routes.walk(async (urlPath: string, route: Route) => {
      const routePaths = await getAllPathsForRoute(urlPath, route);
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

  async render404() {
    const mainHtml = renderToString(<ErrorPage code={404} title="Not Found" />);
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>404</title>],
    });
    return {html};
  }

  async renderError(err: any) {
    const mainHtml = renderToString(
      <ErrorPage
        code={500}
        title="Error"
        message="An unknown error occurred."
      />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>500</title>],
    });
    return {html};
  }

  async renderDevServer404(req: Request) {
    const sitemap = await this.getSitemap();
    const mainHtml = renderToString(
      <DevNotFoundPage req={req} sitemap={sitemap} />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>404 | Root.js</title>],
    });
    return {html};
  }

  async renderDevServer500(req: Request, error: unknown) {
    const [route, routeParams] = this.routes.get(req.path);
    const mainHtml = renderToString(
      <DevErrorPage
        req={req}
        route={route}
        routeParams={routeParams}
        error={error}
      />
    );
    const html = await this.renderHtml(mainHtml, {
      headComponents: [<title>500 | Root.js</title>],
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
        assetCssDeps.forEach((dep) => cssDeps.add(dep));
      })
    );

    return {jsDeps, cssDeps};
  }
}
