---
'@blinkk/root': patch
---

Fix pods: resolve pod route assets at render time so SSR no longer logs "could not find build asset: pod/<name>/..." for pod route HTML pages. The build now aliases each pod route's virtual `pod/<name>/...` src to the asset built from the route's real file path, so the route's CSS deps are collected correctly.
