import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

/**
 * `CMS_THEME=dark` (or `pnpm test:visual:dark`) runs the suite with the
 * built-in dark theme loaded (see `vitest.setup.dark.ts`), keeping its
 * goldens in `__screenshots__/dark/` next to the stock ones.
 */
const theme = process.env.CMS_THEME;
if (theme && theme !== 'dark') {
  throw new Error(`CMS_THEME must be "dark", got "${theme}"`);
}

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      instances: [{browser: 'chromium'}],
      provider: playwright(),
      headless: true,
      // Don't save screenshots on failure.
      screenshotFailures: false,
      expect: theme
        ? {
            toMatchScreenshot: {
              resolveScreenshotPath: ({
                arg,
                browserName,
                ext,
                platform,
                root,
                screenshotDirectory,
                testFileDirectory,
                testFileName,
              }) =>
                `${root}/${testFileDirectory}/${screenshotDirectory}/${theme}/${testFileName}/${arg}-${browserName}-${platform}${ext}`,
            },
          }
        : undefined,
    },
    setupFiles: [
      './vitest.setup.ts',
      ...(theme ? [`./vitest.setup.${theme}.ts`] : []),
    ],
    include: ['**/*.visual.test.tsx'],
    testTimeout: 10000,
  },
  optimizeDeps: {
    include: ['preact/jsx-dev-runtime'],
  },
});
