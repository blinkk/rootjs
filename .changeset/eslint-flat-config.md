---
'@blinkk/eslint-config-root': major
---

feat: migrate to eslint flat config (eslint.config.js) and update dependencies

BREAKING CHANGE: the config is now exported in flat config format and requires
ESLint 10+. Consumers must switch from `.eslintrc` to `eslint.config.js`.
`eslint-plugin-node` is replaced by `eslint-plugin-n` and `eslint-plugin-import`
by `eslint-plugin-import-x`.
