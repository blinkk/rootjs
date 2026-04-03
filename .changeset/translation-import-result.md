---
'@blinkk/root-cms': minor
---

Add `TranslationImportResult` type for `onImport` handlers, allowing translation services to return rich notifications (with title, message, link, and color) instead of only `TranslationRow[]`. Also add `color` property to `TranslationExportResult` for controlling notification appearance. The UI now renders action buttons and custom colors for both import and export notifications.
