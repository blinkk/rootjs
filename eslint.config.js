const rootConfig = require('@blinkk/eslint-config-root');

module.exports = [
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
