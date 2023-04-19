# ESLint config for Root.js projects

## Setup

Install deps:

```sh
yarn add eslint prettier typescript
yarn add -D @blinkk/eslint-config-root
```

Add eslint config file `.eslintrc.json`:

```json
{
  "extends": [
    "@blinkk/root"
  ]
}
```

Add `.eslintignore`:

```
node_modules/
build/
dist/
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "fix": "eslint . --ext .ts,.tsx --fix"
  }
}
```
