import path from 'node:path';
import {RootConfig} from '../core/config.js';
import {Route, RouteModule} from '../core/types.js';
import {RouteTrie} from './route-trie.js';

const ROUTES_FILES = import.meta.glob<RouteModule>(
  ['/routes/*.ts', '/routes/**/*.ts', '/routes/*.tsx', '/routes/**/*.tsx'],
  {eager: true}
);

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

  async walk(cb: (urlPath: string, route: Route) => void | Promise<void>) {
    await this.routeTrie.walk(cb);
  }

  private initRouteTrie() {
    const locales = this.rootConfig.i18n?.locales || [];
    const basePath = this.rootConfig.base || '/';
    const defaultLocale = this.rootConfig.i18n?.defaultLocale || 'en';

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
      const i18nUrlFormat = toSquareBrackets(
        this.rootConfig.i18n?.urlFormat || '/[locale]/[base]/[path]'
      );
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

      trie.add(routePath, {
        src,
        module: ROUTES_FILES[modulePath],
        locale: defaultLocale,
        isDefaultLocale: true,
        routePath: routePath,
        localeRoutePath: localeRoutePath,
      });

      // At the moment, all routes are assumed to use the site-wide i18n config.
      // TODO(stevenle): provide routes with a way to override the default
      // i18n serving behavior.
      if (i18nUrlFormat.includes('[locale]')) {
        locales.forEach((locale) => {
          const localePath = localeRoutePath.replace('[locale]', locale);
          if (localePath !== relativeRoutePath) {
            trie.add(localePath, {
              src,
              module: ROUTES_FILES[modulePath],
              locale: locale,
              isDefaultLocale: false,
              routePath,
              localeRoutePath,
            });
          }
        });
      }
    });
    return trie;
  }

  async getAllPathsForRoute(
    urlPathFormat: string,
    route: Route
  ): Promise<Array<{urlPath: string; params: Record<string, string>}>> {
    const routeModule = route.module;
    if (!routeModule.default && !routeModule.getStaticContent) {
      return [];
    }

    const trailingSlash = this.rootConfig.server?.trailingSlash;

    const urlPaths: Array<{urlPath: string; params: Record<string, string>}> =
      [];
    const pathHasParams = testPathHasParams(urlPathFormat);
    if (pathHasParams && routeModule.getStaticPaths) {
      const staticPaths = await routeModule.getStaticPaths({
        rootConfig: this.rootConfig,
      });
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
                params: pathParams.params || {},
              });
            }
          }
        );
      }
    } else if (
      routeModule.getStaticProps &&
      !pathHasParams
    ) {
      urlPaths.push({urlPath: normalizeUrlPath(urlPathFormat), params: {}});
    } else if (
      !routeModule.handle &&
      !pathHasParams
    ) {
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

export function replaceParams(
  urlPathFormat: string,
  params: Record<string, string>
) {
  const urlPath = urlPathFormat.replaceAll(
    /\[\[?(\.\.\.)?([\w\-_]*)\]?\]/g,
    (match: string, _wildcard: string, key: string) => {
      const val = params[key];
      if (!val) {
        throw new Error(`unreplaced param ${match} in url: ${urlPathFormat}`);
      }
      return val;
    }
  );
  return urlPath;
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
    (
      options?.trailingSlash === false &&
      urlPath !== '/' &&
      urlPath.endsWith('/')
    )
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

function testPathHasParams(urlPath: string) {
  const segments = urlPath.split('/');
  return segments.some((segment) => {
    return segment.startsWith('[') && segment.includes(']');
  });
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
