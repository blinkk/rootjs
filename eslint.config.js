import fs from 'node:fs';
import rootConfig from '@blinkk/eslint-config-root';

/**
 * CMS UI files still allowed to import Mantine while it's being removed. See
 * `packages/root-cms/docs/ui-rewrite-plan.md`; `pnpm ui:progress` in
 * packages/root-cms reports what's left and prunes migrated files.
 */
const mantineAllowlist = JSON.parse(
  fs.readFileSync('packages/root-cms/ui/mantine-allowlist.json', 'utf8')
);

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.tsbuildinfo',
      'docs/screenshots/.out/**',
      'examples/**',
    ],
  },
  ...rootConfig,
  {
    files: ['packages/root-cms/ui/**/*.{ts,tsx}'],
    ignores: mantineAllowlist.map((file) => `packages/root-cms/${file}`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mantine/*'],
              message:
                'Mantine is being removed from the CMS UI. Use ui/primitives/ (see packages/root-cms/ui/README.md).',
            },
          ],
        },
      ],
    },
  },
];
