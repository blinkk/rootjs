import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  domain: 'https://rootjs.dev',
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
    sessionCookieSecret: 'session-secret-change-me!',
  },
  plugins: [
    cmsPlugin({
      id: 'examples-cms',
      name: 'Examples: CMS',
      firebaseConfig: {
        apiKey: 'AIzaSyDIoi6zECKeyJoCduYEmV5j9PIF-wbpaPo',
        authDomain: 'rootjs-dev.firebaseapp.com',
        projectId: 'rootjs-dev',
        storageBucket: 'rootjs-dev.appspot.com',
      },
      storageConfig: {
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
    }),
  ],
  prettyHtml: true,
});
