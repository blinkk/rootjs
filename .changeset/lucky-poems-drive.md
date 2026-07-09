---
'@blinkk/root': minor
'@blinkk/root-cms': minor
---

feat: v2 translations manager (behind `experiments.v2TranslationsManager`)

Wires up the v2 `TranslationsManager` end to end: a new `i18n.fallbacks`
config for locale fallback chains, a translations manager UI at
`/cms/translations` (list + editor) that replaces the v1 pages when the flag
is on, publishing content docs now publishes their translations in the same
write batch (plus a standalone per-doc Publish action), runtime reads in
`createRoute()` and the missing-translations check use the v2 per-locale
docs, and v1 translations are automatically copy-migrated (and published) on
dev/build boot, leaving v1 data untouched as a backup.

BREAKING (experimental surface, no known callers): the unused
`TranslationsDoc` interface and `RootCMSClient.dbTranslationsPath()`/
`dbTranslationsRef()` helpers were removed, and `BatchRequest`/
`BatchResponse.translations` now uses the per-locale doc schema
(`Record<id, Record<locale, TranslationsLocaleDoc>>`).
`BatchResponse.getTranslations()` accepts a locale or an explicit fallback
chain and resolves `i18n.fallbacks`.
