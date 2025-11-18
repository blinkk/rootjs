import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      instances: [{browser: 'chromium'}],
      provider: playwright(),
      headless: true,
    },
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.visual.test.tsx'],
  },
  optimizeDeps: {
    include: ['preact/jsx-dev-runtime'],
  },
});
