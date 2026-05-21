# ESLint config for Root.js projects

A shareable [flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
for Root.js projects. Requires ESLint 10+.

This package is published as ES modules (ESM). Use an ESM config file —
`eslint.config.mjs`, or `eslint.config.js` in a project with
`"type": "module"` in its `package.json`.

## Setup

Install deps:

```sh
npm install -D @blinkk/eslint-config-root eslint prettier typescript
```

Add an `eslint.config.js` (or `eslint.config.mjs`) at the root of your project:

```js
import rootConfig from '@blinkk/eslint-config-root';

export default [
  {
    ignores: ['**/dist/**', '**/build/**'],
  },
  ...rootConfig,
];
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "fix": "eslint . --fix"
  }
}
```
