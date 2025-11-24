import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      instances: [{browser: 'chromium'}],
      provider: playwright(),
      headless: true,
      // Don't save screenshots on failure.
      screenshotFailures: false,
    },
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.visual.test.tsx'],
    testTimeout: 10000,
  },
  optimizeDeps: {
    include: ['preact/jsx-dev-runtime'],
  },
});
