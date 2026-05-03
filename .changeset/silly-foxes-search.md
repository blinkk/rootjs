---
'@blinkk/root-cms': minor
---

feat: add advanced search panel to the document editor

Adds a "Search" button to the document editor status bar (to the left of the
"Checks" button) that opens a right-hand panel for searching field values
within the current document. Search results deeplink to the matching field;
matches inside rich text custom blocks also open the corresponding edit modal.

Bound to the `cmd+shift+f` (or `ctrl+shift+f`) hotkey.
