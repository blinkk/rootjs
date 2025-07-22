import {defineConfig} from '../../../dist/core.js';

export default defineConfig({
  i18n: {
    urlFormat: '/intl/[locale]/[path]',
    locales: ['en', 'fr'],
  },
  build: {
    excludeDefaultLocaleFromIntlPaths: true,
  },
  prettyHtml: true,
});
