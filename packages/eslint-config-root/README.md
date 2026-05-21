# ESLint config for Root.js projects

A shareable [flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
for Root.js projects. Requires ESLint 10+.

## Setup

Install deps:

```sh
npm install -D @blinkk/eslint-config-root eslint prettier typescript
```

Add an `eslint.config.js` at the root of your project:

```js
const rootConfig = require('@blinkk/eslint-config-root');

module.exports = [
  {
    ignores: ['**/dist/**', '**/build/**'],
  },
  ...rootConfig,
];
```

Or, using ESM (`eslint.config.mjs`, or `.js` with `"type": "module"`):

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
