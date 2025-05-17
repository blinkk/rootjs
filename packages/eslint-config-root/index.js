module.exports = {
  extends: ['eslint:recommended', 'plugin:n/recommended', 'prettier'],
  plugins: ['n', 'prettier', 'import'],
  rules: {
    'prettier/prettier': 'error',
    'block-scoped-var': 'error',
    eqeqeq: 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'eol-last': 'error',
    'prefer-arrow-callback': 'error',
    'no-trailing-spaces': 'error',
    quotes: ['warn', 'single', {avoidEscape: true}],
    'no-restricted-properties': [
      'error',
      {
        object: 'describe',
        property: 'only',
      },
      {
        object: 'it',
        property: 'only',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-warning-comments': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/camelcase': 'off',
        'n/no-missing-import': 'off',
        'n/no-empty-function': 'off',
        'n/no-unsupported-features/es-syntax': 'off',
        'n/no-missing-require': 'off',
        'n/shebang': 'off',
        'no-dupe-class-members': 'off',
        'require-atomic-updates': 'off',
        'import/order': [
          'error',
          {
            groups: [
              'builtin',
              'external',
              'internal',
              'parent',
              'sibling',
              'index',
            ],
            pathGroups: [
              {
                pattern: '@/**',
                group: 'internal',
              },
            ],
            pathGroupsExcludedImportTypes: ['builtin'],
            'newlines-between': 'ignore',
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],
      },
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
};
