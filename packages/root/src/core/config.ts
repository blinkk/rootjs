import {Request, Response, NextFunction} from './types';
import {Plugin} from './plugin';
import {UserConfig as ViteUserConfig} from 'vite';
import {HtmlMinifyOptions} from '../render/html-minify';
import {HtmlPrettyOptions} from '../render/html-pretty';

export interface RootUserConfig {
  /**
   * Canonical domain the website will serve on. Useful for things like the
   * sitemap, SEO tags, etc.
   */
  domain?: string;

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
   * URL format for localized content. Default is `/{locale}/{path}`.
   */
  urlFormat?: string;
}

export interface RootServerConfig {
  /**
   * An array of middleware to add to the express server. These middleware are
   * added to the beginning of the express app.
   */
  middlewares?: Array<
    (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  >;
}

export function defineConfig(config: RootUserConfig): RootUserConfig {
  return config;
}
