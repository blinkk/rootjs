import path from 'node:path';
import {ComponentType} from 'preact';
import {RootConfig} from '../core/config';
import {GetStaticPaths, GetStaticProps} from '../core/types';
import {RouteTrie} from './route-trie';

export interface RouteModule {
  default?: ComponentType<unknown>;
  getStaticPaths?: GetStaticPaths;
  getStaticProps?: GetStaticProps;
}

export interface Route {
  modulePath: string;
  module: RouteModule;
  locale: string;
}

export function getRoutes(config: RootConfig) {
  const locales = config.i18n?.locales || [];
  const i18nUrlFormat = config.i18n?.urlFormat || '/{locale}/{path}';
  const defaultLocale = config.i18n?.defaultLocale || 'en';

  const routes = import.meta.glob(
    ['/routes/*.ts', '/routes/**/*.ts', '/routes/*.tsx', '/routes/**/*.tsx'],
    {
      eager: true,
    }
  );
  const trie = new RouteTrie<Route>();
  Object.keys(routes).forEach((filePath) => {
    let routePath = filePath.replace(/^\/routes/, '');
    const parts = path.parse(routePath);
    if (parts.name.startsWith('_')) {
      return;
    }
    if (parts.name === 'index') {
      routePath = parts.dir;
    } else {
      routePath = path.join(parts.dir, parts.name);
    }
    trie.add(routePath, {
      modulePath: filePath,
      module: routes[filePath] as RouteModule,
      locale: defaultLocale,
    });

    // At the moment, all routes are assumed to use the site-wide i18n config.
    // TODO(stevenle): provide routes with a way to override the default
    // i18n serving behavior.
    locales.forEach((locale) => {
      const localeRoutePath = i18nUrlFormat
        .replace('{locale}', locale)
        .replace('{path}', routePath.replace(/^\/*/, ''));
      if (localeRoutePath !== routePath) {
        trie.add(localeRoutePath, {
          modulePath: filePath,
          module: routes[filePath] as RouteModule,
          locale: locale,
        });
      }
    });
  });
  return trie;
}

export async function getAllPathsForRoute(
  urlPathFormat: string,
  route: Route
): Promise<Array<{urlPath: string; params: Record<string, string>}>> {
  const urlPaths: Array<{urlPath: string; params: Record<string, string>}> = [];
  const routeModule = route.module;
  if (routeModule.getStaticPaths) {
    const staticPaths = await routeModule.getStaticPaths();
    staticPaths.paths.forEach(
      (pathParams: {params: Record<string, string>}) => {
        const urlPath = replaceParams(urlPathFormat, pathParams.params);
        if (pathContainsPlaceholders(urlPath)) {
          console.warn(
            `path contains placeholders: ${urlPathFormat}, double check getStaticPaths() and ensure all params are returned`
          );
        } else {
          urlPaths.push({
            urlPath: replaceParams(urlPathFormat, pathParams.params),
            params: pathParams.params || {},
          });
        }
      }
    );
  } else if (pathContainsPlaceholders(urlPathFormat)) {
    console.warn(
      `path contains placeholders: ${urlPathFormat}, did you forget to define getStaticPaths()?`
    );
  } else {
    urlPaths.push({urlPath: urlPathFormat, params: {}});
  }
  return urlPaths;
}

export function replaceParams(
  urlPathFormat: string,
  params: Record<string, string>
) {
  const urlPath = urlPathFormat.replaceAll(
    /\[(\.\.\.)?([\w\-_]*)\]/g,
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

function pathContainsPlaceholders(urlPath: string) {
  const segments = urlPath.split('/');
  return segments.some((segment) => {
    return segment.startsWith('[') && segment.endsWith(']');
  });
}
