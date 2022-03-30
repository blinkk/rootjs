/* eslint-disable node/no-unpublished-import */
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  return {
    base: mode === 'production' ? '/cms/' : '/',
    server: {
      proxy: {
        '/cms/api': 'http://localhost:4000',
        '/cms/preview': 'http://localhost:4000',
      },
    },
    plugins: [react()],
    clearScreen: false,
  };
});
