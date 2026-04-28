import type {Plugin} from 'vite';
import {defineConfig} from 'vitest/config';

function stubVirtualModules(): Plugin {
  return {
    name: 'stub-virtual-modules',
    resolveId(id) {
      if (id === 'virtual:root/schemas') return '\0virtual:root/schemas';
      return null;
    },
    load(id) {
      if (id === '\0virtual:root/schemas') {
        return 'export const SCHEMA_MODULES = {};';
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [stubVirtualModules()],
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
