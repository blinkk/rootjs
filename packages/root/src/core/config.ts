import {Request, Response, NextFunction} from './types';
import {Plugin} from './plugin';
import {UserConfig as ViteUserConfig} from 'vite';

export interface RootUserConfig {
  /**
   * Config for auto-injecting custom element dependencies.
   */
  elements?: {
    /**
     * A list of directories to use to look for custom elements. The dir path
     * should be relative to the project dir, e.g. "path/to/elements" or
     * "node_modules/my-package".
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
   * Whether to automatically minify HTML output.
   */
  minifyHtml?: boolean;

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
