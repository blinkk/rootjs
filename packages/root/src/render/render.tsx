import path from 'node:path';
import {h, ComponentChildren} from 'preact';
import renderToString from 'preact-render-to-string';
import {getRoutes, RouteModule, Route, getAllPathsForRoute} from './router';
import {HEAD_CONTEXT} from '../core/components/head';
import {ErrorPage} from '../core/components/error-page';
import {getTranslations, I18N_CONTEXT} from '../core/i18n';
import {ScriptProps, SCRIPT_CONTEXT} from '../core/components/script';
import {AssetMap} from './asset-map/asset-map';
import {RootConfig} from '../core/config';
import {RouteTrie} from './route-trie';

// TODO(stevenle): this should be added via config.
const ELEMENTS_MAP: Record<string, string> = {};
const ELEMENTS_MODULES = import.meta.glob([
  '/elements/**/*.ts',
  '/elements/**/*.tsx',
]) as Record<string, () => Promise<RouteModule>>;
Object.keys(ELEMENTS_MODULES).forEach((elementPath) => {
  const parts = path.parse(elementPath);
  ELEMENTS_MAP[parts.name] = elementPath;
});

interface RenderOptions {
  assetMap: AssetMap;
}

interface RenderHtmlOptions {
  mainHtml: string;
  locale: string;
  headComponents?: ComponentChildren[];
}

export class Renderer {
  private routes: RouteTrie<Route>;

  constructor(config: RootConfig) {
    this.routes = getRoutes(config);
  }

  async render(
    url: string,
    options: RenderOptions
  ): Promise<{html: string; notFound?: boolean}> {
    const assetMap = options.assetMap;
    const [route, routeParams] = this.routes.get(url);
    if (route && route.module && route.module.default) {
      return await this.renderRoute(route, {routeParams, assetMap});
    }
    return this.render404();
  }

  async renderRoute(
    route: Route,
    options: {routeParams: Record<string, string>; assetMap: AssetMap}
  ): Promise<{html: string; notFound?: boolean}> {
    const routeParams = options.routeParams;
    const assetMap = options.assetMap;
    const Component = route.module.default;
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

    const headComponents: ComponentChildren[] = [];
    const userScripts: ScriptProps[] = [];
    const vdom = (
      <I18N_CONTEXT.Provider value={{locale, translations}}>
        <SCRIPT_CONTEXT.Provider value={userScripts}>
          <HEAD_CONTEXT.Provider value={headComponents}>
            <Component {...props} />
          </HEAD_CONTEXT.Provider>
        </SCRIPT_CONTEXT.Provider>
      </I18N_CONTEXT.Provider>
    );
    const mainHtml = renderToString(vdom, {}, {pretty: true});

    // Walk the page's dependency tree for CSS dependencies that are added via
    // `import 'foo.scss'` or `import 'foo.module.scss'`.
    const pageAsset = await assetMap.get(route.modulePath);
    const cssDeps = await pageAsset?.getCssDeps();
    if (cssDeps) {
      cssDeps.forEach((cssUrl) => {
        headComponents.push(<link rel="stylesheet" href={cssUrl} />);
      });
    }

    // Parse the HTML for custom elements that are found within the project
    // and automatically inject the script deps for them.
    const scriptDeps = await this.getScriptDeps(mainHtml, {assetMap});
    scriptDeps.forEach((jsUrls) => {
      headComponents.push(<script type="module" src={jsUrls} />);
    });

    // Add user defined scripts added via the `<Script>` component.
    await Promise.all(
      userScripts.map(async (scriptDep) => {
        const scriptAsset = await assetMap.get(scriptDep.src);
        if (!scriptAsset && import.meta.env.PROD) {
          console.log(`could not find precompiled asset: ${scriptDep.src}`);
        }
        const scriptUrl = scriptAsset ? scriptAsset.assetUrl : scriptDep.src;
        headComponents.push(<script type="module" src={scriptUrl} />);
      })
    );

    const html = await this.renderHtml({mainHtml, locale, headComponents});
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
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          {options.headComponents}
        </head>
        <body dangerouslySetInnerHTML={{__html: options.mainHtml}} />
      </html>
    );
    const html = `<!doctype html>\n${renderToString(
      page,
      {},
      {pretty: true}
    )}\n`;
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

  private async getScriptDeps(
    html: string,
    options: {assetMap: AssetMap}
  ): Promise<string[]> {
    const assetMap = options.assetMap as AssetMap;
    const deps = new Set<string>();

    const re = /<(\w[\w-]+\w)/g;
    const matches = Array.from(html.matchAll(re));
    await Promise.all(
      matches.map(async (match) => {
        const tagName = match[1];
        // Custom elements require a dash.
        if (tagName && tagName.includes('-') && tagName in ELEMENTS_MAP) {
          const modulePath = ELEMENTS_MAP[tagName];
          const asset = await assetMap.get(modulePath);
          if (!asset) {
            return;
          }
          const assetJsDeps = await asset.getJsDeps();
          assetJsDeps.forEach((dep) => deps.add(dep));
        }
      })
    );

    return Array.from(deps);
  }
}
