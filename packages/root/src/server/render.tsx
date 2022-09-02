/** @jsx h */
import {ComponentChildren, h} from 'preact';
import renderToString from 'preact-render-to-string';
import path from 'path';
import {minify} from 'html-minifier-terser';
import {getRoutes, PageModule} from './router';
import {HEAD_CONTEXT} from '../runtime/components/head';
import {ErrorPage} from '../runtime/components/error-page';
import {getTranslations, TRANSLATIONS_CONTEXT} from '../runtime/i18n';
import {RootConfig} from '../config';
import {ScriptProps, SCRIPT_CONTEXT} from '../runtime/components/script';
import {AssetMap} from './asset-map';

const ELEMENTS_MAP: Record<string, string> = {};
// TODO(stevenle): this should be added via config.
const ELEMENTS_MODULES = import.meta.glob([
  '/elements/**/*.js',
  '/elements/**/*.jsx',
  '/elements/**/*.ts',
  '/elements/**/*.tsx',
]) as Record<string, () => Promise<PageModule>>;
Object.keys(ELEMENTS_MODULES).forEach(elementPath => {
  const parts = path.parse(elementPath);
  ELEMENTS_MAP[parts.name] = elementPath;
});

interface RenderOptions {
  config: RootConfig;
  assetMap: AssetMap;
}

export const getRouter = (config: RootConfig) => getRoutes(config);

export async function render(url: string, options: RenderOptions) {
  const assetMap = options.assetMap;
  const config = options.config || {};

  const routes = getRoutes(config);

  const [route, params] = routes.get(url);
  if (route && route.module && route.module.default) {
    const Component = route.module.default;
    let props = {};
    if (route.module.getStaticProps) {
      const propsData = await route.module.getStaticProps({params});
      if (propsData.notFound) {
        return {html: '<h1>not found</h1>', deps: []};
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
      <TRANSLATIONS_CONTEXT.Provider value={translations}>
        <SCRIPT_CONTEXT.Provider value={userScripts}>
          <HEAD_CONTEXT.Provider value={headComponents}>
            <Component {...props} />
          </HEAD_CONTEXT.Provider>
        </SCRIPT_CONTEXT.Provider>
      </TRANSLATIONS_CONTEXT.Provider>
    );
    const mainHtml = renderToString(vdom, {}, {pretty: true});

    // Walk the page's dependency tree for CSS dependencies that are added via
    // `import 'foo.scss'` or `import 'foo.module.scss'`.
    const pageAsset = await assetMap.get(route.modulePath);
    const cssDeps = await pageAsset?.getCssDeps();
    if (cssDeps) {
      cssDeps.forEach(cssUrl => {
        headComponents.push(<link rel="stylesheet" href={cssUrl} />);
      });
    }

    // Parse the HTML for custom elements that are found within the project
    // and automatically inject the script deps for them.
    const scriptDeps = await getScriptDeps(mainHtml, {assetMap});
    scriptDeps.forEach(jsUrls => {
      headComponents.push(<script type="module" src={jsUrls} />);
    });

    // Add user defined scripts added via the `<Script>` component.
    await Promise.all(
      userScripts.map(async scriptDep => {
        const scriptAsset = await assetMap.get(scriptDep.src);
        if (!scriptAsset && import.meta.env.PROD) {
          console.log(`could not find precompiled asset: ${scriptDep.src}`);
        }
        const scriptUrl = scriptAsset ? scriptAsset.assetUrl : scriptDep.src;
        headComponents.push(<script type="module" src={scriptUrl} />);
      })
    );

    const html = await renderHtml({mainHtml, locale, headComponents});
    return {html};
  }
  return {html: '<h1>not found</h1>'};
}

interface RenderHtmlOptions {
  mainHtml: string;
  locale: string;
  headComponents?: ComponentChildren[];
}

async function renderHtml(options: RenderHtmlOptions) {
  const page = (
    <html lang={options.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {options.headComponents}
      </head>
      <body dangerouslySetInnerHTML={{__html: options.mainHtml}} />
    </html>
  );
  const html = `<!doctype html>\n${renderToString(page, {}, {pretty: true})}\n`;
  return minifyHtml(html);
}

export async function renderError(error: unknown) {
  const mainHtml = renderToString(<ErrorPage error={error} />);
  const html = await renderHtml({mainHtml, locale: 'en'});
  return {html};
}

/**
 * Extracts all of the custom elements from the rendered HTML and returns a
 * list of JS deps required to render those custom elements.
 */
async function getScriptDeps(html: string, options: any): Promise<string[]> {
  const assetMap = options.assetMap as AssetMap;
  const deps = new Set<string>();

  // Find all custom elements used by the page. Note: custom elements require a
  // dash in the tag name.
  const re = /<(\w+(?:-\w+)+)/g;
  const matches = Array.from(html.matchAll(re));
  await Promise.all(
    matches.map(async match => {
      const tagName = match[1];
      if (tagName && tagName in ELEMENTS_MAP) {
        const modulePath = ELEMENTS_MAP[tagName];
        const asset = await assetMap.get(modulePath);
        if (!asset) {
          return;
        }
        const assetJsDeps = await asset.getJsDeps();
        assetJsDeps.forEach(dep => deps.add(dep));
      }
    })
  );

  return Array.from(deps);
}

async function minifyHtml(html: string): Promise<string> {
  const min = await minify(html, {
    collapseWhitespace: true,
    removeComments: true,
    preserveLineBreaks: true,
  });
  return min.trimStart();
}
