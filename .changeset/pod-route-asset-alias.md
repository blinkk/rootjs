---
'@blinkk/root': patch
---

Fix pod route asset resolution so SSR no longer logs "could not find build asset" for pod-contributed HTML routes, and the route's CSS deps are collected correctly.
