// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {ComponentChildren, ComponentType} from 'preact';
import renderToString from 'preact-render-to-string';
import {getRoutes, getAllPathsForRoute} from './router';
import {HEAD_CONTEXT} from '../core/components/head';
import {ErrorPage} from '../core/components/ErrorPage';
import {getTranslations, I18N_CONTEXT} from '../core/i18n';
import {ScriptProps, SCRIPT_CONTEXT} from '../core/components/script';
import {AssetMap} from './asset-map/asset-map';
import {RootConfig} from '../core/config';
import {RouteTrie} from './route-trie';
import {elementsMap} from 'virtual:root-elements';
import {DevNotFoundPage} from '../core/components/DevNotFoundPage';
import {RequestContext, REQUEST_CONTEXT} from '../core/request-context';
import {HtmlContextValue, HTML_CONTEXT} from '../core/components/html';
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
import {DevErrorPage} from '../core/components/DevErrorPage';

interface RenderHtmlOptions {
  mainHtml: string;
  locale: string;
  headComponents?: ComponentChildren[];
}

export class Renderer {
  private rootConfig: RootConfig;
  private routes: RouteTrie<Route>;
  private assetMap: AssetMap;

  constructor(rootConfig: RootConfig, options: {assetMap: AssetMap}) {
    this.rootConfig = rootConfig;
    this.routes = getRoutes(this.rootConfig);
    this.assetMap = options.assetMap;
  }

  async render(url: string): Promise<{html?: string; notFound?: boolean}> {
    const [route, routeParams] = this.routes.get(url);
    if (route && route.module && route.module.default) {
      return await this.renderRoute(route, {routeParams});
    }
    return {notFound: true};
  }

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
    const headComponents: ComponentChildren[] = [];
    const userScripts: ScriptProps[] = [];
    const htmlContext: HtmlContextValue = {attrs: {}};
    const vdom = (
      <REQUEST_CONTEXT.Provider value={ctx}>
        <I18N_CONTEXT.Provider value={{locale, translations}}>
          <HTML_CONTEXT.Provider value={htmlContext}>
            <HEAD_CONTEXT.Provider value={headComponents}>
              <SCRIPT_CONTEXT.Provider value={userScripts}>
                <Component {...props} />
              </SCRIPT_CONTEXT.Provider>
            </HEAD_CONTEXT.Provider>
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
      userScripts.map(async (scriptDep) => {
        const scriptAsset = await this.assetMap.get(scriptDep.src.slice(1));
        if (scriptAsset) {
          jsDeps.add(scriptAsset.assetUrl);
          const scriptJsDeps = await scriptAsset.getJsDeps();
          scriptJsDeps.forEach((dep) => jsDeps.add(dep));
        }
      })
    );

    cssDeps.forEach((cssUrl) => {
      headComponents.push(<link rel="stylesheet" href={cssUrl} />);
    });
    jsDeps.forEach((jsUrls) => {
      headComponents.push(<script type="module" src={jsUrls} />);
    });

    const htmlLang = htmlContext.attrs.lang || locale;
    const html = await this.renderHtml({
      mainHtml,
      locale: htmlLang,
      headComponents,
    });
    return {html};
  }

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

    const locale = route.locale;
    const translations = getTranslations(locale);
    const ctx: RequestContext = {
      route,
      props,
      routeParams,
      locale,
      translations,
    };
    const headComponents: ComponentChildren[] = [];
    const userScripts: ScriptProps[] = [];
    const htmlContext: HtmlContextValue = {attrs: {}};
    const vdom = (
      <REQUEST_CONTEXT.Provider value={ctx}>
        <I18N_CONTEXT.Provider value={{locale, translations}}>
          <HTML_CONTEXT.Provider value={htmlContext}>
            <HEAD_CONTEXT.Provider value={headComponents}>
              <SCRIPT_CONTEXT.Provider value={userScripts}>
                <Component {...props} />
              </SCRIPT_CONTEXT.Provider>
            </HEAD_CONTEXT.Provider>
          </HTML_CONTEXT.Provider>
        </I18N_CONTEXT.Provider>
      </REQUEST_CONTEXT.Provider>
    );
    const mainHtml = renderToString(vdom);

    const jsDeps = new Set<string>();
    const cssDeps = new Set<string>();

    // Walk the page's dependency tree for CSS dependencies that are added via
    // `import 'foo.scss'` or `import 'foo.module.scss'`.
    const pageAsset = await this.assetMap.get(route.src);
    if (pageAsset) {
      const pageCssDeps = await pageAsset.getCssDeps();
      pageCssDeps.forEach((dep) => cssDeps.add(dep));
    }

    // Parse the HTML for custom elements that are found within the project
    // and automatically inject the script deps for them.
    await this.collectElementDeps(mainHtml, jsDeps, cssDeps);

    // Add user defined scripts added via the `<Script>` component.
    await Promise.all(
      userScripts.map(async (scriptDep) => {
        const scriptAsset = await this.assetMap.get(scriptDep.src.slice(1));
        if (scriptAsset) {
          jsDeps.add(scriptAsset.assetUrl);
          const scriptJsDeps = await scriptAsset.getJsDeps();
          scriptJsDeps.forEach((dep) => jsDeps.add(dep));
        }
      })
    );

    cssDeps.forEach((cssUrl) => {
      headComponents.push(<link rel="stylesheet" href={cssUrl} />);
    });
    jsDeps.forEach((jsUrls) => {
      headComponents.push(<script type="module" src={jsUrls} />);
    });

    const htmlLang = htmlContext.attrs.lang || locale;
    const html = await this.renderHtml({
      mainHtml,
      locale: htmlLang,
      headComponents,
    });
    return {html};
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

  private async renderHtml(options: RenderHtmlOptions) {
    const page = (
      <html lang={options.locale}>
        <head>
          <meta charSet="utf-8" />
          {options.headComponents}
        </head>
        <body dangerouslySetInnerHTML={{__html: options.mainHtml}} />
      </html>
    );
    const html = `<!doctype html>\n${renderToString(page)}\n`;
    return html;
  }

  async render404() {
    const mainHtml = renderToString(<ErrorPage code={404} title="Not Found" />);
    const html = await this.renderHtml({
      mainHtml,
      locale: 'en',
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
    const html = await this.renderHtml({
      mainHtml,
      locale: 'en',
      headComponents: [<title>500</title>],
    });
    return {html};
  }

  async renderDevServer404(req: Request) {
    const sitemap = await this.getSitemap();
    const mainHtml = renderToString(
      <DevNotFoundPage req={req} sitemap={sitemap} />
    );
    const html = await this.renderHtml({
      mainHtml,
      locale: 'en',
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
    const html = await this.renderHtml({
      mainHtml,
      locale: 'en',
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
    const assetMap = this.assetMap;

    const re = /<(\w[\w-]+\w)/g;
    const matches = Array.from(html.matchAll(re));
    await Promise.all(
      matches.map(async (match) => {
        const tagName = match[1];
        // Custom elements require a dash.
        if (tagName && tagName.includes('-') && tagName in elementsMap) {
          const elementModule = elementsMap[tagName];
          const asset = await assetMap.get(elementModule.src);
          if (!asset) {
            return;
          }
          const assetJsDeps = await asset.getJsDeps();
          assetJsDeps.forEach((dep) => jsDeps.add(dep));
          const assetCssDeps = await asset.getCssDeps();
          assetCssDeps.forEach((dep) => cssDeps.add(dep));
        }
      })
    );

    return {jsDeps, cssDeps};
  }
}
