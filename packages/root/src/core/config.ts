import {UserConfig as ViteUserConfig} from 'vite';

export interface RootConfig {
  i18n?: RootI18nConfig;
  vite?: ViteUserConfig;
  sitemap?: boolean;
}

export interface RootI18nConfig {
  locales?: string[];
  defaultLocale?: string;
  urlFormat?: string;
}

export function defineConfig(config: RootConfig): RootConfig {
  return config;
}
