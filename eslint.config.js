import rootConfig from '@blinkk/eslint-config-root';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.tsbuildinfo',
      'examples/**',
    ],
  },
  ...rootConfig,
];
