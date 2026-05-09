import type {Plugin} from 'vite';
import {defineConfig} from 'vitest/config';

function stubVirtualModules(): Plugin {
  return {
    name: 'stub-virtual-modules',
    resolveId(id) {
      if (id === 'virtual:root/schemas') return '\0virtual:root/schemas';
      if (id === 'virtual:root/agents') return '\0virtual:root/agents';
      return null;
    },
    load(id) {
      if (id === '\0virtual:root/schemas') {
        return 'export const SCHEMA_MODULES = {};';
      }
      if (id === '\0virtual:root/agents') {
        return 'export const AGENT_MODULES = {};';
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
