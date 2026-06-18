---
'@blinkk/root-cms': minor
---

feat: add a compact document listing view to the CMS

Adds a "compact" view toggle to collection document listings, rendering a condensed table (image, doc id, badges, created/modified timestamps, and the actions menu) instead of the default cards with titles and preview URLs. The toggle sits between the sort dropdown and the "New" button, and each user's choice is remembered per-collection in local storage.

Collections can also force the compact layout via the schema with `compactView: true`, which is useful for collections without meaningful titles or preview metadata (e.g. redirects). When forced, the toggle is hidden and the listing is locked to the compact view.
