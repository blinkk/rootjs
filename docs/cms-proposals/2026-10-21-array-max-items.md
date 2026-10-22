# Update the developer docs: cms--schemas

- **id:** `2026-10-21-array-max-items`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-22T01:07:40.682Z

## Summary

- Docs/cms--schemas: Mentions the new `maxItems` option for array fields in "Field types".

## Edit `Docs/cms--schemas`

Mentions the new `maxItems` option for array fields in "Field types".

### Set `content.sections`

```diff yaml
 - id: "overview"
   title: "Overview"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "CMS content models are defined in code, in <code>.schema.ts</code> files. They're versioned with the rest of your site, type-checked by TypeScript, and used to generate types for your templates with <code>root-cms generate-types</code>."
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "5DeNdZ"
 - id: "creating-cms-collections"
   title: "Collections"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "A collection is a group of docs that share a schema, like blog posts or landing pages. To add one, create <code>collections/&lt;Name&gt;.schema.ts</code>:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/collections/BlogPosts.schema.ts

         import {schema} from '@blinkk/root-cms';

         export default schema.collection({
           name: 'BlogPosts',
           description: 'Posts for the blog.',
           url: '/blog/[slug]',
           preview: {
             title: 'title',
             image: 'image',
           },
           fields: [
             schema.string({
               id: 'title',
               label: 'Title',
               translate: true,
             }),
             schema.image({
               id: 'image',
               label: 'Image',
               help: 'Upload a 1600x900 JPG.',
             }),
             schema.richtext({
               id: 'content',
               label: 'Content',
               translate: true,
             }),
           ],
         });
       _arrayKey: "cDFlug"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The <code>url</code> tells the CMS where each doc is served, for live preview and links."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "67MyBw"
   _arrayKey: "fQt5dK"
 - id: "composing-schemas"
   title: "Reusable schemas"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Use <code>schema.define()</code> for content models that are used in more than one place, like page modules. <code>schema.glob()</code> collects every schema that matches a pattern, so adding a template file adds it to the CMS:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/templates/TemplateHero/TemplateHero.schema.ts

         import {schema} from '@blinkk/root-cms';

         export default schema.define({
           name: 'TemplateHero',
           fields: [
             schema.string({id: 'title', translate: true}),
             schema.richtext({id: 'body', translate: true}),
             schema.image({id: 'image'}),
           ],
         });
       _arrayKey: "dGnXGF"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/collections/Pages.schema.ts

         import {schema} from '@blinkk/root-cms';

         export default schema.collection({
           name: 'Pages',
           url: '/[...slug]',
           fields: [
             schema.array({
               id: 'modules',
               label: 'Modules',
               of: schema.oneOf({
                 types: schema.glob('/templates/*/*.schema.ts'),
               }),
             }),
           ],
         });
       _arrayKey: "48t6QG"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Each <code>schema.define()</code> name must be unique across the project."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "3vskkW"
   _arrayKey: "sEwucB"
 - id: "collection-options"
   title: "Collection options"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Besides <code>name</code>, <code>url</code>, <code>preview</code> and <code>fields</code>, a collection can set how its docs are listed, named and published in the CMS:"
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<code>group</code>: groups collections together in the CMS's content list."
               items: []
             - content: "<code>previewUrl</code>: the URL the editor's preview pane loads, if it's different from <code>url</code>. <code>domain</code> sets the domain for multi-domain sites."
               items: []
             - content: "<code>preview.defaultImage</code> and <code>preview.fit</code>: a fallback image for docs without one, and whether images are cropped (<code>'cover'</code>, the default) or not (<code>'contain'</code>)."
               items: []
             - content: "<code>slugRegex</code>: a regular expression (as a string) that new slugs must match."
               items: []
             - content: "<code>autoSlug</code>: pre-fills the slug of new docs from a template, e.g. <code>'{date:YYYYMMDD}-{adjective}-{noun}'</code>. Tokens are <code>{date}</code>, <code>{date:FORMAT}</code>, <code>{adjective}</code>, <code>{noun}</code> and <code>{random:N}</code>."
               items: []
             - content: "<code>autolock</code> and <code>autolockReason</code>: lock publishing whenever a doc is edited, so a change has to be unlocked deliberately before it goes live."
               items: []
             - content: "<code>sortOptions</code>: extra sort options for the doc list, e.g. <code>{id: 'title', label: 'Title', field: 'fields.meta.title'}</code>. The first use of a new sort may return an error with a link to create the Firestore index it needs."
               items: []
             - content: "<code>customSorting</code>: lets editors drag docs into a custom order (see below)."
               items: []
             - content: "<code>viewOptions.compact</code>: always lists docs in the compact table view, for collections without useful preview images or titles, like redirects."
               items: []
             - content: "<code>publishing.checks</code>: checks that run before docs are published (see <a href=\"/docs/cms/checks/#publishing-checks\">Checks</a>)."
               items: []
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "With <code>customSorting: true</code>, the doc list has a <b>Custom order</b> sort where editors drag docs into place. The order is saved at <code>sys.sortKey</code> on the draft, so like any edit it goes live when the moved docs are published, and <code>listDocs()</code> returns docs in that order by default. Docs created outside the CMS have no position until an editor assigns one from the banner on the doc list; scripts can assign them with <code>generateKeyBetween()</code> and <code>generateNKeysBetween()</code> from <code>@blinkk/root-cms</code>."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "q3VN2c"
   _arrayKey: "2wcxGh"
 - id: "schema-field-types"
   title: "Field types"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Fields include <code>string</code>, <code>richtext</code>, <code>image</code>, <code>file</code>, <code>select</code>, <code>multiselect</code>, <code>boolean</code>, <code>number</code>, <code>date</code>, <code>datetime</code>, <code>reference</code>, <code>object</code>, <code>array</code> and <code>oneOf</code>. For every field and option, see <code>schema</code> in the <a href=\"/docs/api/root-cms/#blinkk-root-cms-schema\">API reference</a>."
+      - type: "paragraph"
+        data:
+          text: "To cap how many items an <code>array</code> holds, like the modules on a page, set <code>maxItems</code>. Once it's reached, the CMS stops editors from adding, duplicating or pasting items, and writes from the API or Root AI that go over the limit fail validation."
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "6LUKtE"
 - id: "conditional-fields"
   title: "Conditional fields"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "<i>Available in version 4.1.0 and later.</i>"
+      - type: "paragraph"
+        data:
+          text: "Use <code>showWhen</code> to show a field in the editor only when a sibling field has a certain value, like a CTA label that only appears when a &quot;Show CTA&quot; checkbox is checked. <code>field</code> is the ID of a field in the same object, and dot-paths read nested values, e.g. <code>&#039;media._type&#039;</code> for the type picked in a <code>oneOf</code> field."
+    time: 1792517265428
+    version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/templates/TemplateHero/TemplateHero.schema.ts

         import {schema} from '@blinkk/root-cms';

         export default schema.define({
           name: 'TemplateHero',
           fields: [
             schema.boolean({id: 'showCta', checkboxLabel: 'Show CTA'}),
             schema.string({
               id: 'ctaLabel',
               // Shown when the "Show CTA" checkbox is checked.
               showWhen: {field: 'showCta'},
             }),
             schema.oneOf({
               id: 'media',
               types: [ImageSchema, VideoSchema],
             }),
             schema.boolean({
               id: 'autoplay',
               checkboxLabel: 'Autoplay',
               // Shown when a Video is picked for "media".
               showWhen: {field: 'media._type', equals: 'Video'},
             }),
           ],
         });
       _arrayKey: "J1id4L"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "A condition can set one of these operators:"
           - type: "unorderedList"
             data:
               style: "unordered"
               items:
                 - content: "None: the sibling value is truthy, e.g. a checked <code>boolean</code>."
                   items: []
                 - content: "<code>equals</code> and <code>notEquals</code>: the sibling value is (or isn't) exactly this value."
                   items: []
                 - content: "<code>in</code> and <code>notIn</code>: the sibling value is (or isn't) one of a list of values, e.g. <code>{field: 'layout', in: ['split', 'stacked']}</code>."
                   items: []
                 - content: "<code>exists</code>: with <code>true</code>, the sibling has a value; with <code>false</code>, it's empty (unset, <code>''</code> or an empty array)."
                   items: []
           - type: "paragraph"
             data:
               text: "Pass an array of conditions to require all of them, e.g. <code>showWhen: [{field: 'showCta'}, {field: 'variant', equals: 'button'}]</code>."
           - type: "paragraph"
             data:
               text: "<code>showWhen</code> only changes what the editor shows. Hiding a field doesn't clear its data, so an editor can uncheck a box and check it again without losing what they entered, and the value is still published and returned by the API. Check the same condition when you render the field, e.g. <code>{fields.showCta && fields.ctaLabel}</code>."
         time: 1792516938803
         version: "2.28.2"
       _arrayKey: "cegIG3"
   _arrayKey: "aIh6Lr"
-  body:
-    time: 1792517265428
-    blocks:
-      - type: "paragraph"
-        data:
-          text: "<i>Available in version 4.1.0 and later.</i>"
-      - type: "paragraph"
-        data:
-          text: "Use <code>showWhen</code> to show a field in the editor only when a sibling field has a certain value, like a CTA label that only appears when a &quot;Show CTA&quot; checkbox is checked. <code>field</code> is the ID of a field in the same object, and dot-paths read nested values, e.g. <code>&#039;media._type&#039;</code> for the type picked in a <code>oneOf</code> field."
-    version: "lexical-0.31.2"
```
