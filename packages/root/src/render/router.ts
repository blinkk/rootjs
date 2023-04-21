import path from 'node:path';

import {RootConfig} from '../core/config';
import {Route, RouteModule} from '../core/types';

import {RouteTrie} from './route-trie';

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
  Object.keys(routes).forEach((modulePath) => {
    const src = modulePath.slice(1);
    let routePath = modulePath.replace(/^\/routes/, '');
    const parts = path.parse(routePath);
    if (parts.name.startsWith('_')) {
      return;
    }
    if (parts.name === 'index') {
      routePath = parts.dir;
    } else {
      routePath = path.join(parts.dir, parts.name);
    }

    const localeRoutePath = i18nUrlFormat
      .replace('{locale}', '[locale]')
      .replace('{path}', routePath.replace(/^\/*/, ''));

    trie.add(routePath, {
      src,
      module: routes[modulePath] as RouteModule,
      locale: defaultLocale,
      isDefaultLocale: true,
      routePath,
      localeRoutePath,
    });

    // At the moment, all routes are assumed to use the site-wide i18n config.
    // TODO(stevenle): provide routes with a way to override the default
    // i18n serving behavior.
    locales.forEach((locale) => {
      const localePath = localeRoutePath.replace('[locale]', locale);
      if (localePath !== routePath) {
        trie.add(localePath, {
          src,
          module: routes[modulePath] as RouteModule,
          locale: locale,
          isDefaultLocale: false,
          routePath,
          localeRoutePath,
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
  const routeModule = route.module;
  if (!routeModule.default) {
    return [];
  }

  const urlPaths: Array<{urlPath: string; params: Record<string, string>}> = [];
  if (routeModule.getStaticPaths) {
    const staticPaths = await routeModule.getStaticPaths();
    if (staticPaths.paths) {
      staticPaths.paths.forEach(
        (pathParams: {params: Record<string, string>}) => {
          const urlPath = replaceParams(urlPathFormat, pathParams.params || {});
          if (pathContainsPlaceholders(urlPath)) {
            console.warn(
              `path contains placeholders: ${urlPathFormat}, double check getStaticPaths() and ensure all params are returned. more info: https://rootjs.dev/guide/routes#getStaticPaths`
            );
          } else {
            urlPaths.push({
              urlPath: replaceParams(urlPathFormat, pathParams.params),
              params: pathParams.params || {},
            });
          }
        }
      );
    }
  } else if (pathContainsPlaceholders(urlPathFormat)) {
    console.warn(
      `path contains placeholders: ${urlPathFormat}, did you forget to define getStaticPaths()? more info: https://rootjs.dev/guide/routes#getStaticPaths`
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
