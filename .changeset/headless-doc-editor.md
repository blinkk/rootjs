---
'@blinkk/root-cms': minor
---

feat: add headless doc editor mode for embedding via iframe/pop-up

Adds a chrome-less document editor route at
`/cms/embed/content/:collection/:slug` intended to be embedded by clients in an
iframe or pop-up (e.g. for "click to edit" while previewing a page). The
embedded editor:

- Renders only the `DocEditor` (no nav, sidebar, or side-by-side preview).
- Posts `ready` / `saved` / `published` lifecycle messages to the parent window
  (targeted at the configured `allowedIframeOrigins`).
- Supports focusing a field via the existing `?deeplink=` param and inbound
  `scrollToDeeplink` messages (now origin-validated).
- Supports scoping the editor to specific top-level fields via a `?fields=`
  (comma-separated) query param.
