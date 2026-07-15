---
'@blinkk/root-cms': minor
---

feat: manual document ordering in collections (`manualSorting` collection option)

Collections can now opt into manual ordering via `manualSorting: true` in the
collection schema. Editors get a "Manual order" sort in the CMS with
drag-to-reorder (plus "Move to top/bottom" actions), stored as a
fractional-index string at `sys.sortKey` on both the draft and published
copies of each doc so reordering applies to live listings immediately.
`listDocs()` returns docs in manual order by default for opted-in collections
(or explicitly via `orderBy: 'sys.sortKey'`), and the fractional-indexing
helpers (`generateKeyBetween`, `generateNKeysBetween`, `generateKeyAfter`)
are exported for import scripts.
