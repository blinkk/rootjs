import path from 'node:path';
import {URL} from 'node:url';
import {defineConfig} from '@blinkk/root';
import {cmsPlugin} from '@blinkk/root-cms/plugin';

const rootDir = new URL('.', import.meta.url).pathname;

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(rootDir),
      },
    },
  },
  server: {
    // Replace with a long random string before deploying.
    sessionCookieSecret: 'session-secret-change-me!',
  },
  plugins: [
    cmsPlugin({
      id: 'starter',
      name: 'Starter',
      // Replace these values with the web app config from your Firebase
      // project (Firebase console > Project settings > Your apps). See
      // https://rootjs.dev/docs/ for the full setup steps.
      firebaseConfig: {
        apiKey: 'YOUR_FIREBASE_API_KEY',
        authDomain: 'YOUR_FIREBASE_PROJECT_ID.firebaseapp.com',
        projectId: 'YOUR_FIREBASE_PROJECT_ID',
        storageBucket: 'YOUR_FIREBASE_PROJECT_ID.appspot.com',
      },
    }),
  ],
  jsxRenderer: {
    mode: 'pretty',
  },
});
