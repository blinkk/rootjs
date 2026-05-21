---
'@blinkk/root': patch
---

fix: serve a JavaScript MIME type for .js/.mjs module requests, including 404s, so the browser ESM loader does not reject responses with a MIME type mismatch
