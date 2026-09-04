---
'@blinkk/root-cms': patch
---

feat: editor themes (experimental). `cmsPlugin({theme})` sets the project's default — a built-in theme name, `{extends, css}` to tweak a built-in, or `{css}` for a theme from scratch — and each user can choose a different built-in theme, or the stock look, under Settings → User Preferences. CSS can also be added from the CMS without a deploy: site-wide under Site Settings and per user under User Preferences, including `@import` of a hosted file. Built-in themes live in `ui/themes/`; the first, `clarity`, boxes field groups with grounds that alternate by depth, rules the fields a type picker reveals, steps help text down beneath its label, and shares one corner radius across controls. The editor stylesheet exposes `--cms-*` custom properties with stock defaults as the surface meant to last (see `ui/themes/README.md`); the editor's markup may change between versions.
