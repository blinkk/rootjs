# Update the developer docs: cms--data-fetching, localization

- **id:** `2026-10-26-localized-values`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-27T04:47:34.374Z

## Summary

- Docs/localization: Links to localized values in Data fetching from Translating CMS content.
- Docs/cms--data-fetching: Adds sections on localized values: the stored JSON format, the localizable schema option, and resolving them in routes and with resolveLocalizedValues().

## Edit `Docs/localization`

Links to localized values in Data fetching from Translating CMS content.

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
       _arrayKey: "njt1sB"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Each route is then served at a URL per locale, e.g. <code>/ja/about</code>. Use <code>fallbacks</code> to set which locales a missing translation falls back to."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "WZVwjM"
   _arrayKey: "4BKi9P"
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
       _arrayKey: "BBYPTC"
   _arrayKey: "RJB1P5"
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
       _arrayKey: "vkDsDv"
   _arrayKey: "ja2NKT"
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
       - type: "paragraph"
         data:
-          text: "For content that differs by locale but isn't a translation, like a localized image or link, use <a href=\"/docs/cms/localized-values/\">localized values</a>."
+          text: "For content that differs by locale but isn't a translation, like a localized image or link, use <a href=\"/docs/cms/data-fetching/#localized-values\">localized values</a>."
     time: 1792079761368
     version: "2.28.2"
   blocks: []
   _arrayKey: "vdgenZ"
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
       _arrayKey: "pghXRl"
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
       _arrayKey: "QONZGt"
   _arrayKey: "IeMYhd"
```

## Edit `Docs/cms--data-fetching`

Adds sections on localized values: the stored JSON format, the localizable schema option, and resolving them in routes and with resolveLocalizedValues().

### Set `meta.description`

```diff text
-Read CMS content in routes with createRoute() and batch requests: docs, lists, custom ordering and translations.
+Read CMS content in routes with createRoute() and batch requests: docs, lists, custom ordering, translations and localized values.
```

### Set `content.sections`

```diff yaml
 - id: "overview"
   title: "Overview"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>createRoute()</code> is the recommended way to set up routes that are connected to the CMS. Give it a collection, and it loads the doc for each URL and renders the route's component with the doc as <code>props.doc</code>."
       - type: "paragraph"
         data:
           text: "It also handles the details: draft content for <code>?preview=true</code> URLs (which the CMS adds to its preview links), the locale for each request, translations, 404s for missing docs, and <code>Cache-Control</code> headers."
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         // @/routes/[...slug].tsx

         import {createRoute} from '@blinkk/root-cms';
         import {PagesDoc} from '@/root-cms.js';

         export default function Page(props: {doc: PagesDoc}) {
           return <h1>{props.doc.fields?.meta?.title}</h1>;
         }

         // Renders `Pages/<slug>`, e.g. `/about` renders `Pages/about` and `/`
         // renders `Pages/index`.
         export const {handle} = createRoute({
           collection: 'Pages',
           slugParam: 'slug',
         });
       _arrayKey: "aWIcpd"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "For a site built as static HTML (SSG), export <code>getStaticProps</code> and <code>getStaticPaths</code> instead, which build a page for every published doc in the collection:"
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "ieSSMf"
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         export const {getStaticProps, getStaticPaths} = createRoute({
           collection: 'BlogPosts',
           ssg: true,
         });
       _arrayKey: "eznQGX"
   _arrayKey: "iSxO0t"
 - id: "route-options"
   title: "Route options"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Most custom logic maps to an option of <code>createRoute()</code>, so a route rarely needs its own handler:"
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<code>slug</code>: the doc for a single-page route, e.g. <code>{slug: 'index'}</code> in <code>routes/index.tsx</code>. Use <code>slugFormat</code> or <code>getSlug(params)</code> for slugs built from several URL params."
               items: []
             - content: "<code>batchRequest</code> and <code>preRenderHook</code>: load more content for the page and pass it as props (see <a href=\"#batch-requests\">Batch requests</a>)."
               items: []
             - content: "<code>translations</code>: load more translations, such as strings shared by every page (see <a href=\"#translations\">Translations</a>)."
               items: []
             - content: "<code>resolveLocale</code>: choose the locale yourself, e.g. from the user's country."
               items: []
             - content: "<code>resolveDoc</code>: serve a different doc on the same URL, e.g. a regional variant."
               items: []
             - content: "<code>getMode</code>: choose between draft and published content yourself."
               items: []
             - content: "<code>notFoundHook</code>: render your own page when the doc doesn't exist."
               items: []
             - content: "<code>preRenderHook</code>: redirect with <code>props.$redirect</code>, or set a status code with <code>props.$statusCode</code>."
               items: []
             - content: "<code>cache</code> and <code>cacheControl</code>: cache published reads in memory for 60 seconds, and set the <code>Cache-Control</code> header for published pages."
               items: []
       - type: "paragraph"
         data:
           text: "See the <a href=\"/docs/api/root-cms/\"><code>@blinkk/root-cms</code></a> reference for every option."
     time: 1792079761368
     version: "2.28.2"
   blocks: []
   _arrayKey: "ZusNEs"
 - id: "batch-requests"
   title: "Batch requests"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Every read from the CMS is a round trip to Firestore. A batch request combines the reads a page needs: its docs, queries and data sources are fetched in parallel. With the <a href=\"/docs/localization/#translations-manager-v2\">v2 translations manager</a>, the translations for every doc in the batch are then fetched together, for the page's locale only."
       - type: "paragraph"
         data:
           text: "In <code>createRoute()</code>, add reads with the <code>batchRequest</code> option. They're fetched in the same batch as the route's doc. The response is available as <code>ctx.batchResponse</code>, e.g. in <code>preRenderHook</code>, which passes it to the page as props:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         export const {handle} = createRoute({
           collection: 'Pages',
           slugParam: 'slug',
           batchRequest: (req) => {
             req.addDoc('Global/header');
             req.addQuery('posts', 'BlogPosts', {limit: 3});
             req.addDataSource('pricing');
           },
           preRenderHook: (props, ctx) => ({
             ...props,
             header: ctx.batchResponse!.getDoc('Global/header'),
             posts: ctx.batchResponse!.getQuery('posts'),
             pricing: ctx.batchResponse!.getDataSource('pricing'),
           }),
         });
       _arrayKey: "a4iOHk"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Read the results with the response's getters, using the ids you added: <code>getDoc(docId)</code> and <code>getDataSource(id)</code> return <code>null</code> if the doc or data source doesn't exist, and <code>getQuery(queryId)</code> returns an empty array if the query has no results."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "Kh64S7"
   _arrayKey: "RT6rrN"
 - id: "batch-requests-outside-routes"
   title: "Batch requests outside a route"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "In a custom handler, <code>getStaticProps()</code> or a plugin, create a batch request with <code>cmsClient.createBatchRequest()</code>. With <code>translate: true</code> and the <a href=\"/docs/localization/#translations-manager-v2\">v2 translations manager</a>, it also loads the translations for the docs it returns, for the <code>locales</code> you pass:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         import {RootCMSClient} from '@blinkk/root-cms';

         const cmsClient = new RootCMSClient(rootConfig);
         const req = cmsClient.createBatchRequest({
           mode: 'published',
           translate: true,
           locales: [locale],
         });
         req.addDoc('Pages/index');
         req.addTranslations('common');
         const res = await req.fetch();

         const doc = res.getDoc('Pages/index');
         const translations = res.getTranslations(locale);
       _arrayKey: "CIw8n9"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "If the locale depends on the doc, fetch the content first and the translations once the locale is known:"
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "6TJj6H"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         const res = await req.fetchContent();
         const locale = pickLocale(res.getDoc('Pages/index'));
         await req.fetchTranslations(res, {locales: [locale]});
       _arrayKey: "cGuMfC"
   _arrayKey: "koIbvY"
 - id: "listing-docs"
   title: "Listing docs"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "To list the docs in a collection, add a query to the batch request with <code>addQuery()</code>. It takes the same options as <code>cmsClient.listDocs()</code>: <code>limit</code>, <code>offset</code>, <code>orderBy</code>, <code>orderByDirection</code>, and <code>query</code> for Firestore filters."
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         // @/routes/blog/index.tsx, which renders `Pages/blog`.
         export const {handle} = createRoute({
           collection: 'Pages',
           slug: 'blog',
           batchRequest: (req, ctx) => {
             req.addQuery('posts', 'BlogPosts', {
               orderBy: ctx.mode === 'draft' ? 'sys.createdAt' : 'sys.firstPublishedAt',
               orderByDirection: 'desc',
             });
           },
           preRenderHook: (props, ctx) => ({
             ...props,
             posts: ctx.batchResponse!.getQuery('posts'),
           }),
         });
       _arrayKey: "iSHkoe"
   _arrayKey: "CxorAj"
 - id: "custom-order"
   title: "Custom order"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Collections with <code>customSorting: true</code> let editors drag docs into order in the CMS. The order is stored at <code>sys.sortKey</code>:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: "req.addQuery('guides', 'Guides', {orderBy: 'sys.sortKey'});"
       _arrayKey: "R4G1Mk"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Ordering by <code>sys.sortKey</code> leaves out docs that don't have a position yet, e.g. ones created by a script."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "s4NEGK"
   _arrayKey: "Cr2ixi"
 - id: "translations"
   title: "Translations"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>createRoute()</code> loads the translations for the page's locale: the doc's own strings and the strings tagged <code>common</code>. With the <a href=\"/docs/localization/#translations-manager-v2\">v2 translations manager</a>, it loads the translations for docs the page references and docs in its batch request instead of <code>common</code>. In your components, translate strings with <code>useTranslations()</code>:"
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
         import {useTranslations} from '@blinkk/root';

         export default function Page(props: {doc: PagesDoc}) {
           const t = useTranslations();
           return <h1>{t(props.doc.fields?.meta?.title || '')}</h1>;
         }
       _arrayKey: "CDonPr"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "To load more translations, such as strings shared by every page, return their ids from the <code>translations</code> option:"
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "4hRgFG"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         createRoute({
           collection: 'Pages',
           translations: () => ({tags: ['common']}),
         });
       _arrayKey: "IrS6FF"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Outside a route, use <code>cmsClient.loadTranslationsForLocale(locale, {tags: ['common']})</code>. With the v2 translations manager, use a batch request with <code>translate: true</code> and <code>res.getTranslations(locale)</code> instead (see <a href=\"#batch-requests-outside-routes\">Batch requests outside a route</a>), since <code>loadTranslations()</code> and <code>loadTranslationsForLocale()</code> only read the v1 translations."
         time: 1792079761368
         version: "2.28.2"
       _arrayKey: "aNXJ34"
   _arrayKey: "Q3wOz8"
+- id: "localized-values"
+  title: "Localized values"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "<i>Available as of version 4.3.1.</i>"
+      - type: "paragraph"
+        data:
+          text: "Fields in the CMS can have localized values, which allows a user to override a value for a specific locale, such as for localized images."
+      - type: "paragraph"
+        data:
+          text: "Overrides are stored in the field's <code>@&lt;fieldId&gt;</code> metadata key, next to the field's default value, in a <code>localizedValues</code> map keyed by locale:"
+    time: 1793076453596
+    version: "2.28.2"
+  blocks:
+    - _type: "CodeBlock"
+      language: "json"
+      code: |-
+        {
+          "hero": {
+            "title": "Build faster",
+            "image": {"src": "https://.../hero.png", "alt": "Hero"},
+            "@image": {
+              "localizedValues": {
+                "de": {"src": "https://.../hero-de.png", "alt": "Hero"},
+                "ja": null
+              }
+            }
+          }
+        }
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "An override replaces the field's entire value, with no merging, so <code>de</code> above needs its own <code>alt</code>. A <code>null</code> override is valid and clears the field for that locale, e.g. to hide the image in <code>ja</code>. Locales are matched case-insensitively."
+          - type: "paragraph"
+            data:
+              text: "Overrides are supported for fields in a doc's <code>fields</code>, including fields nested in objects, but not for array items, which have no <code>@&lt;fieldId&gt;</code> key, or for fields inside rich text blocks."
+          - type: "paragraph"
+            data:
+              text: "Fields with a single value are localizable by default: <code>string</code>, <code>richtext</code>, <code>image</code>, <code>file</code>, <code>number</code>, <code>boolean</code>, <code>date</code>, <code>datetime</code>, <code>select</code>, <code>multiselect</code>, <code>reference</code> and <code>references</code>. <code>object</code>, <code>array</code> and <code>oneof</code> fields aren't, because an override would copy all of their contents for each locale. Set <code>localizable</code> to change the default for a field:"
+        time: 1793076453596
+        version: "2.28.2"
+    - _type: "CodeBlock"
+      language: "ts"
+      code: |-
+        // @/collections/Pages.schema.ts
+
+        schema.string({id: 'legalText', localizable: false});
+        schema.object({id: 'promo', variant: 'inline', localizable: true, fields: [
+          // ...
+        ]});
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "<code>localizable</code> has no effect on single-locale sites. Object fields shown as drawers (the default <code>variant</code>) have no field header yet, so they can't be localized in the editor."
+        time: 1793076453596
+        version: "2.28.2"
+- id: "resolving-localized-values"
+  title: "Resolving localized values"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "<code>createRoute()</code> resolves localized values for you, for both server-rendered and static routes. Once the locale is known, it replaces each field with its override for that locale, in the route's doc and in the docs and queries of its <a href=\"#batch-requests\">batch request</a>, and removes the <code>localizedValues</code> maps. <code>translations()</code>, <code>preRenderHook()</code> and the page's props get the resolved doc."
+      - type: "paragraph"
+        data:
+          text: "<code>resolveLocale()</code> and <code>resolveDoc()</code> run before the locale is final, so they get the unresolved doc. To get the raw data in the page, e.g. to resolve it yourself, set <code>localizedValues: false</code> on the route."
+      - type: "paragraph"
+        data:
+          text: "Content loaded outside <code>createRoute()</code>'s doc and batch request, e.g. with <code>cmsClient.getDoc()</code> or in <code>getStaticProps()</code>, isn't resolved. Use <code>resolveLocalizedValues()</code>, which works on a doc, a list of docs or any part of one:"
+    time: 1793076453596
+    version: "2.28.2"
+  blocks:
+    - _type: "CodeBlock"
+      language: "ts"
+      code: |-
+        import {resolveLocalizedValues} from '@blinkk/root-cms';
+
+        const rawDoc = await cmsClient.getDoc('Pages', 'index', {mode: 'published'});
+        const doc = resolveLocalizedValues(rawDoc, 'de');
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "It returns a copy and never changes its input. Parts without overrides are shared with the input rather than copied. Pass <code>keepLocalizedValues: true</code> to keep the <code>localizedValues</code> maps in the result."
+          - type: "paragraph"
+            data:
+              text: "Localized values don't follow <code>i18n.fallbacks</code>, which only applies to translations. A locale without its own override gets the field's default value, even if a fallback locale has one. <code>createRoute()</code> always resolves the exact locale. With <code>resolveLocalizedValues()</code>, pass <code>fallbacks</code> to check other locales, in order, when the locale has no override:"
+        time: 1793076453596
+        version: "2.28.2"
+    - _type: "CodeBlock"
+      language: "ts"
+      code: |-
+        // Uses the en-CA override, then en-GB, then the default value.
+        const doc = resolveLocalizedValues(rawDoc, 'en-CA', {fallbacks: ['en-GB']});
 - id: "reading-docs-directly"
   title: "Reading docs directly"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "For a single read, e.g. in a script, use <code>RootCMSClient</code>. Every read takes a <code>mode</code>: <code>published</code> for live content, or <code>draft</code> for the latest edits."
     time: 1792079761368
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         import {RootCMSClient} from '@blinkk/root-cms';

         const cmsClient = new RootCMSClient(rootConfig);
         const doc = await cmsClient.getDoc('Pages', 'index', {mode: 'published'});
         const res = await cmsClient.listDocs('BlogPosts', {mode: 'published'});
       _arrayKey: "h2TXfu"
   _arrayKey: "NFevhB"
```
