---
'@blinkk/root-cms': patch
---

feat: editor themes. `cmsPlugin({theme})` takes a built-in theme name, `{extends, css}` to tweak a built-in, or `{css}` for a theme from scratch. Built-in themes live in `ui/themes/`; the first, `clarity`, boxes field groups with their fields indented behind a rule, steps help text down beneath its label, and neutralises the structural accents. The editor stylesheet now exposes `--cms-*` custom properties (drawer bleed/border/radius/header background/indent/rule, accent colour, help size/colour) with stock defaults, so themes stay declarative.
