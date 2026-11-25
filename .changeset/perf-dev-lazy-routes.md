---
'@blinkk/root': patch
---

feat: lazy-load route modules on demand in root dev

In `root dev`, `Route.module` is lazily loaded on demand for routes without a `config` export; custom middleware inspecting `Route.module` directly can call `ensureRouteModule(route)` exported from `@blinkk/root/render`.
