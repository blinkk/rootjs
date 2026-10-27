# Update the developer docs: cms--localized-values, localization

- **id:** `2026-10-26-localized-values`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-27T04:38:35.101Z

## Summary

- Docs/localization: Links to the new localized values page from Translating CMS content.
- Docs/cms--localized-values: New page on localized field values: the stored JSON format, the localizable schema option, and resolving values in routes and with resolveLocalizedValues().

## Edit `Docs/localization`

Links to the new localized values page from Translating CMS content.

### Set `content.sections`

```diff yaml
 - id: "config"
   title: "Configuration"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Set the site's locales and URL format with the <code>i18n</code> option in <code>root.config.ts</code>:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         import {defineConfig} from '@blinkk/root';

         export default defineConfig({
           i18n: {
             locales: ['en', 'ja'],
             defaultLocale: 'en',
             urlFormat: '/[locale]/[path]',
           },
         });
       _arrayKey: "f7Zr7E"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Each route is then served at a URL per locale, e.g. <code>/ja/about</code>. Use <code>fallbacks</code> to set which locales a missing translation falls back to."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "Wfbj16"
   _arrayKey: "3E7Stm"
 - id: "translations"
   title: "Translations"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Translated strings live in <code>translations/</code>, one JSON file per locale, mapping each source string to its translation:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "json"
       code: |-
         // @/translations/fr.json

         {
           "Hello, world!": "Bonjour le monde !",
           "Hello, {name}!": "Bonjour {name} !"
         }
       _arrayKey: "x0Ghn8"
   _arrayKey: "xtU5jU"
 - id: "useTranslations"
   title: "useTranslations()"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>useTranslations()</code> returns a function that translates a string into the current locale. Values in curly braces are replaced with the params you pass."
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         // @/routes/index.tsx

         import {useTranslations} from '@blinkk/root';

         export default function Page(props) {
           const t = useTranslations();
           if (props.name) {
             return <h1>{t('Hello, {name}!', {name: props.name})}</h1>;
           }
           return <h1>{t('Hello, world!')}</h1>;
         }
       _arrayKey: "XWopY9"
   _arrayKey: "q98rz2"
 - id: "cms-content"
   title: "Translating CMS content"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Schema fields marked with <code>translate: true</code> are sent for translation. Editors translate them in the CMS, with AI, or by exporting them to a spreadsheet or translation vendor."
       - type: "paragraph"
         data:
           text: "Translations are stored in the CMS. <code>createRoute()</code> loads them for each page, and <code>cmsClient.loadTranslationsForLocale()</code> loads them anywhere else. Pass them to <code>ctx.render()</code> to use them with <code>useTranslations()</code>. See <a href=\"/docs/cms/data-fetching/#translations\">Data fetching</a>."
+      - type: "paragraph"
+        data:
+          text: "For content that differs by locale but isn't a translation, like a localized image or link, use <a href=\"/docs/cms/localized-values/\">localized values</a>."
     time: 1792079761368
     version: "2.28.2"
   blocks: []
   _arrayKey: "bB06bN"
 - id: "translations-manager-v2"
   title: "Translations manager v2 (experimental)"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "The v2 translations manager stores each doc's translations with the doc, per locale, and drafts and publishes them together with the doc. It's still experimental, so it's off by default. To try it, opt in:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         cmsPlugin({
           experiments: {v2TranslationsManager: true},
         });
       _arrayKey: "QU5hrJ"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "On the first dev server start or <code>root build</code> after you opt in, the CMS copies your v1 translations into the new format. The v1 data is left in place as a backup. To run the migration yourself, use <code>root-cms translations.migrate</code>, and <code>--status</code> to check whether it has run."
           - type: "paragraph"
             data:
               text: "The migration check runs before each build, so with the v2 translations manager, <b><code>root build</code> needs Firestore access</b>. Make sure your CI has application default credentials, e.g. <code>gcloud auth application-default login</code> or <code>GOOGLE_APPLICATION_CREDENTIALS</code>."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "JtOzf6"
   _arrayKey: "X5eAwe"
```

## Create `Docs/cms--localized-values`

New page on localized field values: the stored JSON format, the localizable schema option, and resolving values in routes and with resolveLocalizedValues().

```yaml
meta:
  title: "Localized values – Root.js"
  description: "Override a CMS field’s value for specific locales, and resolve the overrides when rendering a page."
  category: "cms"
content:
  title: "Localized values"
  body:
    blocks:
      - type: "paragraph"
        data:
          text: "A localized value replaces a field's value for one locale. It's for content that changes by locale but isn't a translation: a hero image with localized text baked in, a link to a regional store, or a price. Strings that only need translating should use <a href=\"/docs/localization/#cms-content\">translations</a> instead."
    time: 1793075914438
    version: "2.28.2"
  sections:
    - id: "editing"
      title: "Editing"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "On sites with more than one locale, localizable fields have a globe button in the field header. It opens a locale picker that lists the doc's enabled locales, except the default locale. The field's existing value becomes the default for every locale without an override, and each override gets its own editor below it, starting as a copy of the default."
        time: 1793075914438
        version: "2.28.2"
      blocks: []
    - id: "data-format"
      title: "Data format"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Overrides are stored in the field's <code>@&lt;fieldId&gt;</code> metadata key, next to the field's default value, in a <code>localizedValues</code> map keyed by locale:"
        time: 1793075914438
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "json"
          code: |-
            {
              "hero": {
                "title": "Build faster",
                "image": {"src": "https://.../hero.png", "alt": "Hero"},
                "@image": {
                  "localizedValues": {
                    "de": {"src": "https://.../hero-de.png", "alt": "Hero"},
                    "ja": null
                  }
                }
              }
            }
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "An override replaces the field's entire value, with no merging, so <code>de</code> above needs its own <code>alt</code>. A <code>null</code> override is valid and clears the field for that locale, e.g. to hide the image in <code>ja</code>. Locales are matched case-insensitively."
              - type: "paragraph"
                data:
                  text: "Overrides are supported for fields in a doc's <code>fields</code>, including fields nested in objects, but not for array items, which have no <code>@&lt;fieldId&gt;</code> key, or for fields inside rich text blocks."
            time: 1793075914438
            version: "2.28.2"
    - id: "localizable"
      title: "Which fields are localizable"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Fields with a single value are localizable by default: <code>string</code>, <code>richtext</code>, <code>image</code>, <code>file</code>, <code>number</code>, <code>boolean</code>, <code>date</code>, <code>datetime</code>, <code>select</code>, <code>multiselect</code>, <code>reference</code> and <code>references</code>. <code>object</code>, <code>array</code> and <code>oneof</code> fields aren't, because an override would copy all of their contents for each locale. Set <code>localizable</code> to change the default for a field:"
        time: 1793075914438
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            // @/collections/Pages.schema.ts

            schema.string({id: 'legalText', localizable: false});
            schema.object({id: 'promo', variant: 'inline', localizable: true, fields: [
              // ...
            ]});
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "<code>localizable</code> has no effect on single-locale sites. Object fields shown as drawers (the default <code>variant</code>) have no field header yet, so they can't be localized in the editor."
            time: 1793075914438
            version: "2.28.2"
    - id: "routes"
      title: "Resolving in routes"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "<code>createRoute()</code> resolves localized values for you, for both server-rendered and static routes. Once the locale is known, it replaces each field with its override for that locale, in the route's doc and in the docs and queries of its <a href=\"/docs/cms/data-fetching/#batch-requests\">batch request</a>, and removes the <code>localizedValues</code> maps. <code>translations()</code>, <code>preRenderHook()</code> and the page's props get the resolved doc."
          - type: "paragraph"
            data:
              text: "<code>resolveLocale()</code> and <code>resolveDoc()</code> run before the locale is final, so they get the unresolved doc. To get the raw data in the page, e.g. to resolve it yourself, set <code>localizedValues: false</code> on the route."
        time: 1793075914438
        version: "2.28.2"
      blocks: []
    - id: "resolve-localized-values"
      title: "resolveLocalizedValues()"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Content loaded outside <code>createRoute()</code>'s doc and batch request, e.g. with <code>cmsClient.getDoc()</code> or in <code>getStaticProps()</code>, isn't resolved. Use <code>resolveLocalizedValues()</code>, which works on a doc, a list of docs or any part of one:"
        time: 1793075914438
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            import {resolveLocalizedValues} from '@blinkk/root-cms';

            const rawDoc = await cmsClient.getDoc('Pages', 'index', {mode: 'published'});
            const doc = resolveLocalizedValues(rawDoc, 'de');
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "It returns a copy and never changes its input. Parts without overrides are shared with the input rather than copied. Pass <code>keepLocalizedValues: true</code> to keep the <code>localizedValues</code> maps in the result."
            time: 1793075914438
            version: "2.28.2"
    - id: "fallbacks"
      title: "Fallbacks"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Localized values don't follow <code>i18n.fallbacks</code>, which only applies to translations. A locale without its own override gets the field's default value, even if a fallback locale has one. <code>createRoute()</code> always resolves the exact locale. With <code>resolveLocalizedValues()</code>, pass <code>fallbacks</code> to check other locales, in order, when the locale has no override:"
        time: 1793075914438
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            // Uses the en-CA override, then en-GB, then the default value.
            const doc = resolveLocalizedValues(rawDoc, 'en-CA', {fallbacks: ['en-GB']});
```
