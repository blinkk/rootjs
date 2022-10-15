import {UserConfig as ViteUserConfig} from 'vite';

export interface RootConfig {
  /**
   * Configuration for auto-injecting custom element dependencies.
   */
  elements?: {
    /**
     * A list of directories to use to look for custom elements. The dir path
     * should be relative to the project dir, e.g. "path/to/elements" or
     * "node_modules/my-package".
     */
    include?: string[];
  };

  /**
   * Configuration options for localization and internationalization.
   */
  i18n?: RootI18nConfig;

  /**
   * Vite configuration.
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
   * URL format for localized content. Default is `/{locale}/{path}`.
   */
  urlFormat?: string;
}

export function defineConfig(config: RootConfig): RootConfig {
  return config;
}
