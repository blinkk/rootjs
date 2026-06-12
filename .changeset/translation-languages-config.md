---
'@blinkk/root': minor
'@blinkk/root-cms': minor
---

feat: add `i18n.translationLanguages` config to map root locales to translation languages

Translation systems often use different language identifiers than root
locales, and multiple root locales may share the same translations. The new
`i18n.translationLanguages` config in root.config.ts maps a root locale to
the language identifier used wherever translations are imported, exported,
or edited:

```ts
i18n: {
  locales: ['en', 'en_mx', 'en_co', 'en_gb', 'en_ca', 'fr_ca'],
  translationLanguages: {
    en_mx: 'es-419',
    en_co: 'es-419',
    en_gb: 'en-GB',
    en_ca: 'en-GB',
    fr_ca: 'fr-CA',
  },
}
```

With the config above, CSV and Google Sheets exports use a single `es-419`
column for the `en_mx` and `en_co` locales, imports fan the `es-419` values
out to both locales, the CMS translations pages show a single `es-419` field,
and translation services receive rows keyed by `es-419` (plus a new
`translationLanguages` field on `TranslationServiceContext`).
