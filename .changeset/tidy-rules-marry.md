---
'@blinkk/root': patch
---

fix: keep `<link>`, `<style>`, `<script>` (and other metadata elements) on their own line in pretty mode

In pretty mode, non-visual metadata/resource elements (`base`, `link`, `meta`, `script`, `style`, `title`) now always render on their own line, even inside a parent that mixes text and elements. Previously a stray text node alongside these tags would collapse them onto a single line. Also adds `<base>` to the default block elements.
