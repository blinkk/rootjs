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
  locales: ['en', 'es-419_mx', 'es-419_co'],
  translationLanguages: {
    'es-419_mx': 'es-419',
    'es-419_co': 'es-419',
  },
}
```

With the config above, CSV and Google Sheets exports use a single `es-419`
column, imports fan the `es-419` values out to both locales, the CMS
translations pages show a single `es-419` field, and translation services
receive rows keyed by `es-419` (plus a new `translationLanguages` field on
`TranslationServiceContext`).
