import path from 'path';
import {RootConfig} from '../config';
import {RouteTrie} from './route-trie';

export interface PageModule {
  default: any;
  getStaticPaths?: () => any[];
  getStaticProps?: (ctx: {params: Record<string, string>}) => any;
}

export interface Route {
  modulePath: string;
  module: PageModule;
  locale: string;
}

export function getRoutes(config: RootConfig) {
  const locales = config.i18n?.locales || ['en'];
  const i18nUrlFormat = config.i18n?.urlFormat || '/{locale}/{path}';
  const defaultLocale = config.i18n?.defaultLocale || 'en';

  const pages = import.meta.glob(
    ['/src/pages/**/*.jsx', '/src/pages/**/*.tsx'],
    {eager: true}
  );
  const trie = new RouteTrie<Route>();
  Object.keys(pages).forEach(pagePath => {
    let routePath = pagePath.replace(/^\/src\/pages/, '');
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
      modulePath: pagePath,
      module: pages[pagePath] as PageModule,
      locale: defaultLocale,
    });

    locales.forEach(locale => {
      const localeRoutePath = i18nUrlFormat
        .replace('{locale}', locale)
        .replace('{path}', routePath.replace(/^\/*/, ''));
      if (localeRoutePath !== routePath) {
        trie.add(localeRoutePath, {
          modulePath: pagePath,
          module: pages[pagePath] as PageModule,
          locale: locale,
        });
      }
    });
  });
  return trie;
}
