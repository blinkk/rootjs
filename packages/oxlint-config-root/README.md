# Oxlint config for Root.js projects

A shareable [oxlint](https://oxc.rs/docs/guide/usage/linter) configuration
for Root.js projects.

## Setup

Install deps:

```sh
pnpm add -D oxlint @blinkk/oxlint-config-root
```

Add an `.oxlintrc.json` at the root of your project:

```json
{
  "extends": ["@blinkk/oxlint-config-root/oxlintrc.json"]
}
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "oxlint",
    "fix": "oxlint --fix"
  }
}
```

## Formatting

This package covers linting only. For formatting, pair it with
[`@oxc-project/oxfmt`](https://www.npmjs.com/package/@oxc-project/oxfmt):

```sh
pnpm add -D @oxc-project/oxfmt
```

```json
{
  "scripts": {
    "format": "oxfmt .",
    "format:check": "oxfmt --check ."
  }
}
```

## Notes

- `import/order` is supported as a subset of `eslint-plugin-import`. The
  `pathGroups` option for `@/**` is forwarded and will be honored on
  oxlint versions that implement it; earlier versions silently ignore it.
- The TypeScript ruleset mirrors the relaxed defaults from
  `@blinkk/eslint-config-root` (many opinionated `typescript/*` rules
  are turned off).
