import path from 'node:path';
import {ROUTE_MODULES, POD_ROUTE_MODULES} from 'virtual:root/routes';
import {RootConfig} from '../core/config.js';
import {GetStaticPaths, Route, RouteModule} from '../core/types.js';
import {replaceParams, testPathHasParams} from '../utils/url-path-params.js';
import {RouteTrie} from './route-trie.js';

type RouteModuleLoader = () => Promise<RouteModule>;
type RouteModuleEntry = RouteModule | RouteModuleLoader;

interface PodRouteEntry {
  module?: RouteModule;
  loadModule?: RouteModuleLoader;
  podName: string;
  routePath: string;
  src: string;
}

const ROUTES_FILES = ROUTE_MODULES as Record<string, RouteModuleEntry>;
const POD_ROUTES = (POD_ROUTE_MODULES || {}) as Record<string, PodRouteEntry>;

/**
 * Ensures a route's module is loaded, invoking its lazy `loadModule` loader if
 * present and updating `route.module`. The loader is retained so Vite SSR HMR
 * updates are picked up on subsequent requests even when a `Router` instance is
 * reused across requests.
 */
export async function ensureRouteModule(route: Route): Promise<RouteModule> {
  if (route.loadModule) {
    route.module = await route.loadModule();
  }
  return route.module;
}

/**
 * Cache of `getStaticPaths()` promises keyed by `RouteModule`, shared across
 * all localized entries of the same route within a single `getSitemap()` call.
 */
export type StaticPathsCache = Map<RouteModule, ReturnType<GetStaticPaths>>;

export class Router {
  private rootConfig: RootConfig;
  private routeTrie: RouteTrie<Route>;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    this.routeTrie = this.initRouteTrie();
  }

  get(url: string) {
    return this.routeTrie.get(url);
  }

  matchAll(url: string) {
    return this.routeTrie.matchAll(url);
  }

  async walk(cb: (urlPath: string, route: Route) => void | Promise<void>) {
    await this.routeTrie.walk(cb);
  }

  private initRouteTrie() {
    const locales = this.rootConfig.i18n?.locales || [];
    const basePath = this.rootConfig.base || '/';
    const defaultLocale = this.rootConfig.i18n?.defaultLocale || 'en';
    const i18nUrlFormat = toSquareBrackets(
      this.rootConfig.i18n?.urlFormat || '/[locale]/[base]/[path]'
    );

    const trie = new RouteTrie<Route>();
    Object.keys(ROUTES_FILES).forEach((modulePath) => {
      const src = modulePath.slice(1);
      let relativeRoutePath = modulePath.replace(/^\/routes/, '');
      const parts = path.parse(relativeRoutePath);
      if (parts.name.startsWith('_')) {
        return;
      }
      if (parts.name === 'index') {
        relativeRoutePath = parts.dir;
      } else {
        relativeRoutePath = path.join(parts.dir, parts.name);
      }

      const urlFormat = '/[base]/[path]';
      const placeholders = {
        base: removeSlashes(basePath),
        path: removeSlashes(relativeRoutePath),
      };

      const formatUrl = (format: string) => {
        const url = format
          .replaceAll('[base]', placeholders.base)
          .replaceAll('[path]', placeholders.path);
        return normalizeUrlPath(url, {
          trailingSlash: this.rootConfig.server?.trailingSlash,
        });
      };

      const routePath = formatUrl(urlFormat);
      const localeRoutePath = formatUrl(i18nUrlFormat);
      const entry = ROUTES_FILES[modulePath];
      const isLazy = typeof entry === 'function';
      const routeModule: RouteModule = isLazy ? {} : entry;
      const loadModule: RouteModuleLoader | undefined = isLazy
        ? entry
        : undefined;

      trie.add(routePath, {
        src,
        module: routeModule,
        ...(loadModule ? {loadModule} : {}),
        locale: defaultLocale,
        isDefaultLocale: true,
        routePath: routePath,
        localeRoutePath: localeRoutePath,
      });

      // A route can override the site-wide `i18n.locales` by exporting a
      // `config` object with its own `locales` list. The default-locale path
      // (added above) is always generated.
      const routeLocales = routeModule.config?.locales || locales;
      if (i18nUrlFormat.includes('[locale]')) {
        routeLocales.forEach((locale) => {
          const localePath = localeRoutePath.replace('[locale]', locale);
          if (localePath !== relativeRoutePath) {
            trie.add(localePath, {
              src,
              module: routeModule,
              ...(loadModule ? {loadModule} : {}),
              locale: locale,
              isDefaultLocale: false,
              routePath,
              localeRoutePath,
            });
          }
        });
      }
    });

    // Register pod routes. These have pre-computed routePaths (mount already
    // applied). User routes registered above take precedence since they're
    // added to the trie first.
    Object.keys(POD_ROUTES).forEach((key) => {
      const entry = POD_ROUTES[key];
      const routeModule: RouteModule = entry.module || {};
      const loadModule = entry.loadModule;
      const routePath = entry.routePath;
      const localeRoutePath = i18nUrlFormat.includes('[locale]')
        ? i18nUrlFormat
            .replaceAll('[base]', removeSlashes(basePath))
            .replaceAll('[path]', removeSlashes(routePath))
        : routePath;
      const normalizedLocaleRoutePath = normalizeUrlPath(localeRoutePath, {
        trailingSlash: this.rootConfig.server?.trailingSlash,
      });

      trie.add(routePath, {
        src: entry.src,
        module: routeModule,
        ...(loadModule ? {loadModule} : {}),
        locale: defaultLocale,
        isDefaultLocale: true,
        routePath,
        localeRoutePath: normalizedLocaleRoutePath,
        podName: entry.podName,
      });

      const podRouteLocales = routeModule.config?.locales || locales;
      if (i18nUrlFormat.includes('[locale]')) {
        podRouteLocales.forEach((locale) => {
          const localePath = normalizedLocaleRoutePath.replace(
            '[locale]',
            locale
          );
          if (localePath !== routePath) {
            trie.add(localePath, {
              src: entry.src,
              module: routeModule,
              ...(loadModule ? {loadModule} : {}),
              locale: locale,
              isDefaultLocale: false,
              routePath,
              localeRoutePath: normalizedLocaleRoutePath,
              podName: entry.podName,
            });
          }
        });
      }
    });

    return trie;
  }

  async getAllPathsForRoute(
    urlPathFormat: string,
    route: Route,
    options?: {staticPathsCache?: StaticPathsCache}
  ): Promise<Array<{urlPath: string; params: Record<string, string>}>> {
    const routeModule = await ensureRouteModule(route);
    if (!routeModule.default && !routeModule.getStaticContent) {
      return [];
    }

    const trailingSlash = this.rootConfig.server?.trailingSlash;

    const urlPaths: Array<{urlPath: string; params: Record<string, string>}> =
      [];
    const pathHasParams = testPathHasParams(urlPathFormat);
    if (pathHasParams && routeModule.getStaticPaths) {
      const cache = options?.staticPathsCache;
      let staticPathsPromise = cache?.get(routeModule);
      if (!staticPathsPromise) {
        staticPathsPromise = routeModule.getStaticPaths({
          rootConfig: this.rootConfig,
        });
        if (cache) {
          cache.set(routeModule, staticPathsPromise);
          staticPathsPromise.catch(() => {
            if (cache.get(routeModule) === staticPathsPromise) {
              cache.delete(routeModule);
            }
          });
        }
      }
      const staticPaths = await staticPathsPromise;
      if (staticPaths.paths) {
        staticPaths.paths.forEach(
          (pathParams: {params: Record<string, string>}) => {
            const urlPath = replaceParams(
              urlPathFormat,
              pathParams.params || {}
            );
            if (testPathHasParams(urlPath)) {
              console.warn(
                `path contains params: ${urlPathFormat}, double check getStaticPaths() and ensure all params are returned. more info: https://rootjs.dev/guide/routes#getStaticPaths`
              );
            } else {
              urlPaths.push({
                urlPath: normalizeUrlPath(urlPath, {trailingSlash}),
                params: {...(pathParams.params || {})},
              });
            }
          }
        );
      }
    } else if (routeModule.getStaticProps && !pathHasParams) {
      urlPaths.push({urlPath: normalizeUrlPath(urlPathFormat), params: {}});
    } else if (!routeModule.handle && !pathHasParams) {
      urlPaths.push({urlPath: normalizeUrlPath(urlPathFormat), params: {}});
    } else if (
      pathHasParams &&
      !routeModule.handle &&
      !routeModule.getStaticPaths
    ) {
      console.warn(
        [
          `warning: path contains params: ${urlPathFormat}.`,
          `define either ssg getStaticPaths() or ssr handle() for route: ${route.src}.`,
          'more info: https://rootjs.dev/guide/routes',
        ].join('\n')
      );
    }

    return urlPaths;
  }
}

export function normalizeUrlPath(
  urlPath: string,
  options?: {trailingSlash?: boolean}
) {
  // Collapse multiple slashes, e.g. `/foo//bar` => `/foo/bar`;
  urlPath = urlPath.replace(/\/+/g, '/');
  // Remove trailing slash.
  if (
    testPathHasFileExt(urlPath) ||
    (options?.trailingSlash === false &&
      urlPath !== '/' &&
      urlPath.endsWith('/'))
  ) {
    urlPath = removeTrailingSlash(urlPath);
  }
  // Convert `/index` to `/`.
  if (urlPath.endsWith('/index')) {
    urlPath = urlPath.slice(0, -6);
  }
  // Add leading slash if needed.
  if (!urlPath.startsWith('/')) {
    urlPath = `/${urlPath}`;
  }
  // Add trailing slash if needed.
  if (
    options?.trailingSlash &&
    !testPathHasFileExt(urlPath) &&
    !urlPath.endsWith('/')
  ) {
    urlPath = `${urlPath}/`;
  }
  return urlPath;
}

function testPathHasFileExt(urlPath: string) {
  const basename = path.basename(removeTrailingSlash(urlPath));
  return basename.includes('.');
}

function removeSlashes(str: string) {
  return removeTrailingSlash(removeLeadingSlash(str));
}

function removeLeadingSlash(str: string) {
  return str.replace(/^\/*/g, '');
}

function removeTrailingSlash(str: string) {
  return str.replace(/\/*$/g, '');
}

/**
 * Older path formats used `/{locale}/{path}` and should be converted to
 * `/[locale]/[base]/[path]`.
 */
function toSquareBrackets(str: string) {
  if (str.includes('{') || str.includes('}')) {
    const val = str.replaceAll('{', '[').replaceAll('}', ']');
    console.warn(`"${str}" is a deprecated format, please switch to "${val}"`);
    return val;
  }
  return str;
}
