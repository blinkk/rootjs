import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  domain: 'https://rootjs.dev',
  i18n: {
    // locales: ['en'],
    locales: ['en', 'de', 'es', 'fr', 'it', 'pt'],
  },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(rootDir),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [path.resolve(rootDir, './styles')],
        },
      },
    },
    build: {
      modulePreload: false,
    },
  },
  server: {
    trailingSlash: true,
    sessionCookieSecret: process.env.COOKIE_SECRET,
  },
  plugins: [
    cmsPlugin({
      id: 'www',
      name: 'Root.js',
      firebaseConfig: {
        apiKey: process.env.GAPI_API_KEY,
        authDomain: 'rootjs-dev.firebaseapp.com',
        projectId: 'rootjs-dev',
        storageBucket: 'rootjs-dev.appspot.com',
      },
      gapi: {
        apiKey: process.env.GAPI_API_KEY,
        clientId: process.env.GAPI_CLIENT_ID,
      },
      gci: true,
      sidebar: {
        tools: {
          design: {label: 'Design System', iframeUrl: '/design'},
        },
      },
      translations: [
        {
          id: 'example',
          label: 'Example',
          icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m5 3-3 3m22-3-3 3M12 7v5l3 3"/></svg>',
          import: async (ctx, data) => {
            // Example: returns mock translations for each source string.
            return data.map((row) => ({
              source: row.source,
              translations: Object.fromEntries(
                ctx.locales.map((locale) => [
                  locale,
                  row.translations[locale] || `[${locale}] ${row.source}`,
                ])
              ),
            }));
          },
          export: async (ctx, data) => {
            console.log(
              `[Example] Exported ${data.length} strings for doc "${ctx.docId}"`
            );
          },
        },
      ],
      checks: [
        {
          id: 'custom/green-check',
          label: 'Green Check',
          description: 'This check passes every time.',
          run: async () => {
            return {status: 'success', message: 'All good!'};
          },
        },
        {
          id: 'custom/yellow-check',
          label: 'Yellow Check',
          description: 'This check warns every time.',
          run: async () => {
            return {
              status: 'warning',
              message: 'Something may or may not have gone wrong!',
            };
          },
        },
        {
          id: 'custom/red-check',
          label: 'Red Check',
          description: 'This check fails every time.',
          run: async () => {
            return {status: 'error', message: 'Test failed!'};
          },
        },
      ],
      experiments: {
        ai: true,
      },
      preview: {
        channel: true,
      },
    }),
  ],
  prettyHtml: true,
  prettyHtmlOptions: {
    indent_size: 0,
    end_with_newline: true,
    extra_liners: ['img', 'root-header', 'root-island'],
  },
  experiments: {
    enableScriptAsync: true,
  },
});
