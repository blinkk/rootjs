import {UserConfig as ViteUserConfig} from 'vite';

import {HtmlMinifyOptions} from '../render/html-minify';
import {HtmlPrettyOptions} from '../render/html-pretty';

import {Plugin} from './plugin';
import {RequestMiddleware} from './types';

export interface RootUserConfig {
  /**
   * Canonical domain the website will serve on. Useful for things like the
   * sitemap, SEO tags, etc.
   */
  domain?: string;

  /**
   * The base URL path that the site will serve on. Defaults to `/`;
   */
  base?: string;

  /**
   * Config for auto-injecting custom element dependencies.
   */
  elements?: {
    /**
     * A list of directories to use to look for custom elements. The dir path
     * should be relative to the project dir, e.g. "path/to/elements".
     */
    include?: string[];

    /**
     * A list of RegEx patterns to exclude. The string passed to the RegEx is
     * the file URL relative to the project root, e.g. "/elements/foo/foo.ts".
     */
    exclude?: RegExp[];
  };

  /**
   * Config options for localization and internationalization.
   */
  i18n?: RootI18nConfig;

  /**
   * Config options for the Root.js express server.
   */
  server?: RootServerConfig;

  /**
   * Vite config.
   * @see {@link https://vitejs.dev/config/} for more information.
   */
  vite?: ViteUserConfig;

  /**
   * Whether to automatically minify HTML output. This is enabled by default,
   * in order to disable, pass `minifyHtml: false` to root.config.ts.
   */
  minifyHtml?: boolean;

  /**
   * Options to pass to html-minifier-terser.
   */
  minifyHtmlOptions?: HtmlMinifyOptions;

  /**
   * Whether to pretty print HTML output.
   */
  prettyHtml?: boolean;

  /**
   * Options to pass to js-beautify.
   */
  prettyHtmlOptions?: HtmlPrettyOptions;

  /**
   * Whether to include a sitemap.xml file to the build output.
   */
  sitemap?: boolean;

  /**
   * Plugins.
   */
  plugins?: Plugin[];
}

export type RootConfig = RootUserConfig & {
  rootDir: string;
};

export interface LocaleGroup {
  label?: string;
  locales: string[];
}

export interface RootI18nConfig {
  /**
   * Locales enabled for the site.
   */
  locales?: string[];

  /**
   * The default locale to use. Defaults is `en`.
   */
  defaultLocale?: string;

  /**
   * URL format for localized content. Default is `/[locale]/[base]/[path]`.
   */
  urlFormat?: string;

  /**
   * Localization groups, to help UIs (like Root.js CMS) logically group
   * locales.
   */
  groups?: Record<string, LocaleGroup>;
}

export interface RootRedirectConfig {
  source: string;
  destination: string;
  type?: number;
}

export interface RootHeaderConfig {
  /** A glob pattern match (regex not supported yet). */
  source: string;
  headers: Array<{
    key: string;
    value: string;
  }>;
}

export interface RootServerConfig {
  /**
   * An array of middleware to add to the express server. These middleware are
   * added to the beginning of the express app.
   */
  middlewares?: RequestMiddleware[];

  /**
   * The `trailingSlash` config allows you to control how the server handles
   * trailing slashes. This config only affects URLs that do not have a file
   * extension (i.e. HTML paths).
   *
   * - When `true`, the server redirects URLs to add a trailing slash
   * - When `false`, the server redirects URLs to remove a trailing slash
   * - When unspecified, the server allows URLs with and without trailing slash
   */
  trailingSlash?: boolean;

  /**
   * Cookie secret for the session middleware.
   */
  sessionCookieSecret?: string | string[];

  /**
   * List of redirects.
   */
  redirects?: RootRedirectConfig[];

  /**
   * HTTP headers to add to a response.
   */
  headers?: RootHeaderConfig[];

  /**
   * Whether to automatically add CSP headers and nonce values.
   */
  csp?: boolean;
}

export function defineConfig(config: RootUserConfig): RootUserConfig {
  return config;
}
