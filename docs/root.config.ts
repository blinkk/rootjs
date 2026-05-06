import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';
import {crowdinTranslationService} from './plugins/crowdin-translations.js';
import {deeplTranslationService} from './plugins/deepl-translations.js';
import {templatesPod} from './plugins/templates-pod.js';

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
    templatesPod(),
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
          templates: {label: 'Templates', iframeUrl: '/cms-tools/templates/'},
        },
      },
      ai: {
        models: [
          {
            id: 'claude-opus-4-7',
            label: 'Claude Opus 4.7',
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            capabilities: {tools: true, reasoning: true, attachments: true},
          },
        ],
      },
      translations: [
        crowdinTranslationService({
          apiToken: process.env.CROWDIN_API_TOKEN,
          localeMapping: {es: 'es-ES', pt: 'pt-PT'},
          rootDir: 'Root CMS Docs',
        }),
        deeplTranslationService({apiKey: process.env.DEEPL_API_KEY}),
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
  experiments: {
    enableScriptAsync: true,
  },
  jsxRenderer: {
    mode: 'pretty',
    blockElements: [
      'root-code',
      'root-counter',
      'root-drawer',
      'root-header',
      'root-island',
      'root-node',
    ],
  },
});
