import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/*.visual.test.tsx', 'node_modules/**/*'],
    alias: {
      react: '@preact/compat',
      'react-dom': '@preact/compat',
      'react/jsx-runtime': '@preact/compat/jsx-runtime',
    },
  },
});
