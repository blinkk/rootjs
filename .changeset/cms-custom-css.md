---
'@blinkk/root-cms': patch
---

feat: editor theme CSS (experimental). `cmsPlugin({theme: {file}})` points at a stylesheet that styles the document editor for everyone on the project (served behind the editor's login, re-read on each request); each user can switch it off for themselves under Settings → User Preferences. CSS can also be added from the CMS without a deploy: site-wide under Site Settings and per user under User Preferences, including `@import` of a hosted file. The editor stylesheet exposes `--cms-*` custom properties with stock defaults as the surface meant to last (see `docs/editor-theme.md`); the editor's markup may change between versions.
