---
'@blinkk/root': minor
---

feat: add `<StyleDeps>` for per-page CSS of dynamically-imported components

Root collects a route's CSS by walking its static import graph, so the
`.module.scss` of a component loaded via `import()` is never linked. The new
`<StyleDeps src="...">` component registers a rendered component's source path so
Root resolves and injects its CSS deps, letting a page load only the CSS for the
components it actually renders.
