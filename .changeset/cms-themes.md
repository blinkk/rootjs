---
'@blinkk/root-cms': patch
---

feat: theme stylesheet hook (experimental). `cmsPlugin({themes, defaultTheme})` registers themes for the CMS UI — each a stylesheet in the project, or one exported by a package or plugin — served behind the CMS's login and re-read on each request. Every user picks their own under Settings → User Preferences; `defaultTheme` applies until they do. CSS can also be added from the CMS without a deploy: site-wide under Site Settings and per user under User Preferences, including `@import` of a hosted file. `ui/styles/theme.css` holds every `--cms-*` custom property at its stock value and is the file to copy to start a theme (see `docs/themes.md`); the CMS's markup may change between versions.
