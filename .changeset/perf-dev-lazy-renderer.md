---
'@blinkk/root': patch
---

feat: defer and cache SSR renderer in dev server middleware

In `root dev`, `/cms` and `/cms/*` routes skip eager `req.renderer` loading so the CMS SPA opens without compiling site routes on cold start, while projects with custom `server.middlewares` or non-`root-cms` `configureServer` plugins continue to resolve `req.renderer` eagerly on non-`/cms` requests so auth and route-protection middlewares work unchanged.
