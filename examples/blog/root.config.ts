import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';
import {passwordProtectPlugin} from '@blinkk/root-password-protect/plugin';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  domain: 'https://rootjs.dev',
  i18n: {
    locales: ['en', 'es', 'pt_br', 'de', 'fr', 'it', 'ja', 'ko', 'zh'],
    groups: {
      americas: {
        label: 'Americas',
        locales: ['en', 'es', 'pt_br'],
      },
      emea: {
        label: 'EMEA',
        locales: ['de', 'fr', 'it'],
      },
      japac: {
        label: 'JAPAC',
        locales: ['ja', 'ko', 'zh'],
      },
    },
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
          includePaths: [path.resolve(rootDir, './styles')],
        },
      },
    },
  },
  server: {
    trailingSlash: false,
    sessionCookieSecret: 'blog-session-secret-change-me!',
    redirects: [
      {source: '/news', destination: '/blog'},
      {source: '/news/[slug]', destination: '/blog/[slug]'},
      {source: '/restricted/[...path]', destination: '/unauthorized'},
    ],
    headers: [
      {source: '/test-json.txt', headers: [{key: 'content-type', value: 'application/json'}]},
    ],
  },
  plugins: [
    cmsPlugin({
      id: 'examples-blog',
      name: 'Examples: Blog',
      firebaseConfig: {
        apiKey: 'AIzaSyDIoi6zECKeyJoCduYEmV5j9PIF-wbpaPo',
        authDomain: 'rootjs-dev.firebaseapp.com',
        projectId: 'rootjs-dev',
        storageBucket: 'rootjs-dev.appspot.com',
        messagingSenderId: '636169634531',
        appId: '1:636169634531:web:7b8fe398f10e5d9c4e7bd6',
        measurementId: 'G-5JTQHSPWBB',
      },
      gapi: {
        apiKey: process.env.GAPI_API_KEY,
        clientId: process.env.GAPI_CLIENT_ID,
      },
      gci: true,
    }),
    passwordProtectPlugin({
      protectedRoutes: [
        {
          source: '/protected/**',
          password: {
            hash: '5bf26990606155160f737b95686a7301990ddc4f07648fd762ce08f3d5438125f13f90f8c1bc801f669e570202a52bc0623d1988c56909b7c4de6a646653a4ca',
            salt: '29a0f4cb8d70f2cbf3eb71d876cd48da',
          },
        },
      ],
    }),
  ],
  prettyHtml: true,
});
