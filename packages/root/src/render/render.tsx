// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {ComponentChildren} from 'preact';
import renderToString from 'preact-render-to-string';
import ssrPrepass from 'preact-ssr-prepass';
import {getRoutes, Route, getAllPathsForRoute} from './router';
import {HEAD_CONTEXT} from '../core/components/head';
import {ErrorPage} from '../core/components/error-page';
import {getTranslations, I18N_CONTEXT} from '../core/i18n';
import {ScriptProps, SCRIPT_CONTEXT} from '../core/components/script';
import {AssetMap} from './asset-map/asset-map';
import {RootConfig} from '../core/config';
import {RouteTrie} from './route-trie';
import {elementsMap} from 'virtual:root-elements';
import {DevNotFoundPage} from '../core/components/dev-not-found-page';
import {RequestContext, REQUEST_CONTEXT} from '../core/request-context';
import {HtmlContextValue, HTML_CONTEXT} from '../core/components/html';

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

  async renderRoute(
    route: Route,
    options: {routeParams: Record<string, string>}
  ): Promise<{html?: string; notFound?: boolean}> {
    const routeParams = options.routeParams;
    const assetMap = this.assetMap;
    const Component = route.module.default;
    if (!Component) {
      throw new Error(
        'unable to render route. the route should have a default export that renders a jsx component.'
      );
    }
    let props = {};
    if (route.module.getStaticProps) {
      const propsData = await route.module.getStaticProps({
        params: routeParams,
      });
      if (propsData.notFound) {
        return this.render404();
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
    const userHeadComponents: ComponentChildren[] = [];
    const userScripts: ScriptProps[] = [];
    const htmlContext: HtmlContextValue = {attrs: {}};
    const vdom = (
      <REQUEST_CONTEXT.Provider value={ctx}>
        <I18N_CONTEXT.Provider value={{locale, translations}}>
          <HTML_CONTEXT.Provider value={htmlContext}>
            <HEAD_CONTEXT.Provider value={userHeadComponents}>
              <SCRIPT_CONTEXT.Provider value={userScripts}>
                <Component {...props} />
              </SCRIPT_CONTEXT.Provider>
            </HEAD_CONTEXT.Provider>
          </HTML_CONTEXT.Provider>
        </I18N_CONTEXT.Provider>
      </REQUEST_CONTEXT.Provider>
    );

    // Do an initial pass on the vdom to evaluate any Suspense components.
    await ssrPrepass(vdom);
    // Freeze the context variables on the second pass and render the vdom to
    // an HTML string.
    Object.freeze(userHeadComponents);
    Object.freeze(userScripts);
    Object.freeze(htmlContext);
    const mainHtml = renderToString(vdom);

    const jsDeps = new Set<string>();
    const cssDeps = new Set<string>();

    // Walk the page's dependency tree for CSS dependencies that are added via
    // `import 'foo.scss'` or `import 'foo.module.scss'`.
    const pageAsset = await assetMap.get(route.src);
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
        const scriptAsset = await assetMap.get(scriptDep.src.slice(1));
        if (scriptAsset) {
          jsDeps.add(scriptAsset.assetUrl);
          const scriptJsDeps = await scriptAsset.getJsDeps();
          scriptJsDeps.forEach((dep) => jsDeps.add(dep));
        }
      })
    );

    const headComponents = [...userHeadComponents];
    cssDeps.forEach((cssUrl) => {
      headComponents.push(<link rel="stylesheet" href={cssUrl} />);
    });
    jsDeps.forEach((jsUrls) => {
      headComponents.push(<script type="module" src={jsUrls} />);
    });

    const htmlLang = htmlContext.attrs.lang || locale;
    const html = await this.renderHtml({
      mainHtml,
      headComponents,
      locale: htmlLang,
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
    return {
      html: '<!doctype html><html><title>404 Not Found</title><h1>404 Not Found</h1>',
      notFound: true,
    };
  }

  async renderError(error: unknown) {
    const mainHtml = renderToString(<ErrorPage error={error} />);
    const html = await this.renderHtml({mainHtml, locale: 'en'});
    return {html};
  }

  async renderDevServer404() {
    const sitemap = await this.getSitemap();
    const mainHtml = renderToString(<DevNotFoundPage sitemap={sitemap} />);
    const html = await this.renderHtml({
      mainHtml,
      locale: 'en',
      headComponents: [<title>404: Not Found</title>],
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
