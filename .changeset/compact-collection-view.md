---
'@blinkk/root-cms': minor
---

feat: add a compact document listing view to the CMS

Adds a "compact" view toggle to collection document listings, rendering a condensed table (image, doc id, title, badges, and created/modified timestamps) instead of the default cards with large titles and preview URLs. The toggle sits between the sort dropdown and the "New" button, and each user's choice is remembered per-collection in local storage.

Collections can also force the compact layout via the schema with `viewOptions: {compact: true}`, which is useful for collections without meaningful preview metadata (e.g. redirects). When forced, the toggle is hidden and the listing is locked to the compact view.

The compact table's column headers (ID, Title, Created, Modified) are clickable to change the sort order (kept in sync with the sort dropdown, which gains matching Title and ascending-modified options). When any document in the collection belongs to a pending release, the table shows a dedicated "Release" column with the release badges. Reloads (e.g. after changing the sort) now dim the existing rows with a spinner overlay instead of blanking the page. Created/Modified cells and the doc status badges share a new `UserActionTooltip` that shows the acting user's avatar with the timestamp.
