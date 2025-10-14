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
        apiKey: 'AIzaSyDIoi6zECKeyJoCduYEmV5j9PIF-wbpaPo',
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
          docs: {
            label: 'Root.js Docs',
            externalUrl: 'https://rootjs.dev/guide/introduction',
          },
        },
      },
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
