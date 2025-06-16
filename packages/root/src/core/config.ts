import {UserConfig as ViteUserConfig} from 'vite';
import {HtmlMinifyOptions} from '../render/html-minify.js';
import {HtmlPrettyOptions} from '../render/html-pretty.js';
import {Plugin} from './plugin.js';
import {RequestMiddleware} from './types.js';

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
   * Build options for the `root build` command.
   */
  build?: RootBuildConfig;

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

  /**
   * Experimental config options. Note: these are subject to change at any time.
   */
  experiments?: {
    /** Whether to render `<script>` tags with `async`. */
    enableScriptAsync?: boolean;
  };
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

export interface RootBuildConfig {
  /**
   * Excludes the `/intl/{defaultLocale}/...` path from the SSG build.
   */
  excludeDefaultLocaleFromIntlPaths?: boolean;
}

export interface RootRedirectConfig {
  /**
   * The source path to redirect. Accepts placeholders in the format
   * `[key]` or `[...key]`. Use `[key]` for single segments and
   * `[...key]` for multi-segment wildcards.
   * @example "/old-path/[id]" or "/old-path/[...wildcard]"
   */
  source: string;

  /**
   * The destination to redirect to. Placeholders from the source can
   * optionally be inserted into the destination using the same
   * placeholder format.
   * @example "/new-path/[id]" or "/new-path/[...wildcard]"
   */
  destination: string;

  /**
   * The redirect type (`301` = permanent, `302` = temporary). If unspecified,
   * defaults to `302` (temporary).
   */
  type?: 301 | 302;
}

export interface RootHeaderConfig {
  /** A glob pattern match (regex not supported yet). */
  source: string;
  headers: Array<{
    key: string;
    value: string;
  }>;
}

export interface ContentSecurityPolicyConfig {
  directives?: Record<string, string[]>;
  reportOnly?: boolean;
}

export interface XFrameOptionsConfig {
  action: 'DENY' | 'SAMEORIGIN';
}

export interface RootSecurityConfig {
  /**
   * Content-Security-Policy config. If enabled, a nonce is auto-generated
   * for every request and appended to script and stylesheet tags. You can
   * validate your CSP headers using a tool like {@link https://csp-evaluator.withgoogle.com/}.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP}
   */
  contentSecurityPolicy?: ContentSecurityPolicyConfig | boolean;

  /**
   * Strict-Transport-Security config. When enabled, the header value is set
   * to `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
   */
  strictTransportSecurity?: boolean;

  /**
   * X-Content-Type-Options config. When enabled, the header value is set to
   * `X-Content-Type-Options: nosniff`.
   */
  xContentTypeOptions?: boolean;

  /**
   * X-Frame-Options config. Setting this value to `true` will default the
   * header value to `X-Frame-Options: SAMEORIGIN`.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options}
   */
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | boolean;

  /**
   * X-XSS-Protection config. When enabled, the header value is set to
   * `X-XSS-Protection: 1; mode=block`.
   */
  xXssProtection?: boolean;
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
   * List of redirects. Supports optional wildcards.
   *
   * @example
   * ```ts
   * redirects: [
   *   {
   *     source: '/old-path/[id]',
   *     destination: '/new-path/[id]',
   *     type: 301,
   *   },
   *   {
   *     source: '/old-path/[...wildcard]',
   *     destination: '/new-path/[...wildcard]',
   *   },
   * ]
   * ```
   */
  redirects?: RootRedirectConfig[];

  /**
   * HTTP headers to add to a response.
   */
  headers?: RootHeaderConfig[];

  /**
   * HTTP security settings. By default, all security settings are enabled with
   * commonly used default values.
   */
  security?: RootSecurityConfig;

  /**
   * Home page URL path, which is printed when the dev server starts.
   */
  homePagePath?: string;
}

export function defineConfig(config: RootUserConfig): RootUserConfig {
  return config;
}
