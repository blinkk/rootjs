---
'@blinkk/eslint-config-root': major
---

feat: migrate to eslint flat config (eslint.config.js) and update dependencies

BREAKING CHANGE: the config is now exported in flat config format and requires
ESLint 10+. It is also published as ESM only, so consumers must switch from
`.eslintrc` to an ESM flat config (`eslint.config.mjs`, or `eslint.config.js`
with `"type": "module"`). `eslint-plugin-node` is replaced by `eslint-plugin-n`
and `eslint-plugin-import` by `eslint-plugin-import-x`.
