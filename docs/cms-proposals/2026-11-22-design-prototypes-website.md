# Feature Design Prototypes on the rootjs.dev homepage

- **id:** `2026-11-22-design-prototypes-website`
- **version:** 1
- **author:** docs/cms-proposals

## Summary

- Pages/index: Add a Design Prototypes feature spotlight right after Root AI, highlighting design-system-aware prototyping in the CMS UI or agent harnesses (like Antigravity and Claude Code) and converting approved mocks into production components.
- Pages/index: Mention prototyping and agent harnesses in the Automate pillar and Agent-ready CLI feature card, and re-balance section themes/layouts.

## Edit `Pages/index`

Add the Design Prototypes spotlight module (note: attach cms-design-prototypes.png from the asset library after uploading the new screenshot scene) and update the Automate pillar and Agent-ready CLI card.

### Set `content.modules`

```diff yaml
 - command: "pnpm create @blinkk/root"
   id: "hero"
   _type: "TemplateHero"
   buttons:
     - options:
         - "variant:primary"
       label: "Get started"
       href: "/docs/"
       _arrayKey: "VVRe2x"
     - options:
         - "variant:outline"
       label: "View on GitHub"
       href: "https://github.com/blinkk/rootjs"
       _arrayKey: "5hSaay"
   image:
     filename: "cms-editor-preview.png"
     uploadedBy: "stevenle08@gmail.com"
     uploadedAt: "1793643609164"
     width: 2880
     height: 1800
     src: "https://lh3.googleusercontent.com/NUnE18whmd_x2-xasA6masBchuJMNwge48Z6Ts40GHenuqyoRu4A1TBolO11vvxakf2hgFqv9oztT8pVm0EryNfaMzITxkacuWvE"
     gcsPath: "/rootjs-dev.appspot.com/www/uploads/2848a8b33fc837f43c2d168b571b5d56c48a06c7.png"
     alt: "The Root CMS doc editor, with the fields for a garden market landing page on the left and a live desktop and mobile preview of the page on the right."
     assetId: "PKJjP1TLJKIp"
   eyebrow: "Root.js · The Web Platform"
   title: "Build. Edit. Ship."
   body:
     time: 1795304336520
     blocks:
       - type: "paragraph"
         data:
           text: "Root.js pairs a fast web framework with a CMS your whole team will actually enjoy:<br>live previews, AI, localization, and publishing workflows, all built in."
     version: "lexical-0.31.2"
   _arrayKey: "dCVaBN"
 - eyebrow: "One platform"
   options:
     - "theme:tint"
   title: "One system for code and content"
   body: "Most teams end up wiring together a separate framework, headless CMS, translation tool, and deploy pipeline. Root.js ships them together so they share the same schemas, routes, and previews."
   id: "platform"
   _type: "TemplatePillars"
   pillars:
     - icon: "code"
       body: "Write server-rendered TSX with file-based routing and web component islands, backed by Vite."
       bullets:
         - text: "Zero client JavaScript by default"
           _arrayKey: "83xrrU"
         - text: "i18n routing and sitemaps built in"
           _arrayKey: "iW6mw1"
         - text: "Deploy to Firebase or App Engine"
           _arrayKey: "uNZwTn"
       title: "A TypeScript framework built on Vite"
       link:
         href: "/guides/"
         label: "Read the guides"
       eyebrow: "Build"
       _arrayKey: "gwBXpR"
     - icon: "preview"
       link:
         label: "Explore the CMS"
         href: "#features"
       eyebrow: "Manage"
       bullets:
         - text: "Content models defined in code"
           _arrayKey: "1c6QeM"
         - text: "Schedule launches with releases"
           _arrayKey: "TIvCNW"
         - text: "Roles, publishing locks, and version history"
           _arrayKey: "7B5T5M"
       body: "Edit fields alongside a live preview, coordinate launches with releases, and manage translations and comments in one UI."
       title: "A CMS backed by your own Firestore"
       _arrayKey: "SRitf2"
     - bullets:
-        - text: "Chat with docs and releases in the CMS"
+        - text: "Prototype new pages and components on a shared canvas"
+          _arrayKey: "pR0t01"
+        - text: "Chat with docs, schemas, and releases in the CMS"
           _arrayKey: "zJuPYx"
-        - text: "Bring your own model provider"
+        - text: "Bring your own model provider or agent harness"
           _arrayKey: "aAeby8"
-        - text: "Review agent edits before they land"
-          _arrayKey: "K0rj2G"
       icon: "ai"
       eyebrow: "Automate"
       title: "AI that works with your schemas"
       link:
         href: "#root-ai"
         label: "See Root AI"
-      body: "Use Root AI in the browser or connect external agents through the CLI to draft, translate, and update content under your team’s review."
+      body: "Use Root AI in the CMS—or connect external agents like Antigravity or Claude Code—to prototype new pages, draft and translate content, and ship under your team’s review."
       _arrayKey: "2fT3Ex"
   _arrayKey: "LoeXx7"
 - title: "Built-in AI that understands your schemas"
   body:
     time: 1790641965893
     version: "lexical-0.31.2"
     blocks:
       - data:
           text: "Ask Root AI to search, draft, translate, or reorganize content across your site. Because it uses the same CMS actions your editors do, every edit lands as a draft you can review before publishing."
         type: "paragraph"
   id: "root-ai"
   _type: "TemplateFeatureSpotlight"
   highlights:
     - text: "Reads and edits docs, schemas, and releases"
       _arrayKey: "wyDeqW"
     - text: "Read-only, approve-each-step, or auto modes"
       _arrayKey: "QM2Kxn"
     - text: "Anthropic, OpenAI, Google, or any compatible model provider"
       _arrayKey: "dSzNGs"
   eyebrow: "Root AI"
   image:
     filename: "cms-root-ai.png"
     uploadedBy: "stevenle08@gmail.com"
     uploadedAt: "1793643625948"
     width: 1920
     height: 1200
     src: "https://lh3.googleusercontent.com/PFoWcbYXNvdPD-_Jbtq13a-VsPbFTBuLOt9Z-nQfvFFMcA4q2UGYTSHCsWGsO8AYjdqDusdGzXLPGl0egnWnoQ7p_eG5_n4ZlA"
     gcsPath: "/rootjs-dev.appspot.com/www/uploads/651eb6d2dc898ee2ebcdba75788e2790d7477c8e.png"
     alt: "Root AI chat in the CMS: a request to localize a page and add it to a release, with the tool calls Root AI ran to do it."
     assetId: "UW5E19gpgMEp"
   _arrayKey: "Jlye8e"
-- id: "schemas"
-  body: "Define schemas in TypeScript to generate typed props automatically, then render them directly in your TSX components."
+- id: "prototypes"
+  _type: "TemplateFeatureSpotlight"
   options:
     - "theme:tint"
+    - "layout:image-left"
+  eyebrow: "Design Prototypes"
+  title: "Design and iterate on new pages with Root AI"
+  body:
+    time: 1795400400000
+    version: "lexical-0.31.2"
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "Explore new pages and components on an isolated canvas with Root AI, which understands your site’s existing design system and templates. Update prototypes directly in the CMS or from your favorite agent harness—like Antigravity or Claude Code—gather pinned team feedback, and let your harness convert approved mocks straight into production-ready components."
+  highlights:
+    - text: "Root AI builds with your site’s design tokens and existing components"
+      _arrayKey: "dpH1g1"
+    - text: "Iterate in the CMS UI or from Antigravity, Claude Code, and other agent harnesses"
+      _arrayKey: "dpH1g2"
+    - text: "Convert reviewed, approved mocks directly into production-ready components"
+      _arrayKey: "dpH1g3"
+  _arrayKey: "dpSp0t"
+- id: "schemas"
+  body: "Define schemas in TypeScript to generate typed props automatically, then render them directly in your TSX components."
   eyebrow: "Content as code"
   files:
     - filename: "templates/TemplateHero/TemplateHero.schema.ts"
       code: |-
         import {schema} from '@blinkk/root-cms';

         export default schema.define({
           name: 'TemplateHero',
           fields: [
             schema.string({id: 'title', translate: true}),
             schema.richtext({id: 'body'}),
             schema.image({id: 'image'}),
           ],
         });
       language: "ts"
       caption: "Define the fields editors fill in."
       _arrayKey: "pFA4qk"
     - language: "tsx"
       filename: "templates/TemplateHero/TemplateHero.tsx"
       code: |-
         import {RichText} from '@blinkk/root-cms/richtext';
         import {TemplateHeroFields} from '@/root-cms.js';

         // Props are typed from your schema.
         export function TemplateHero(
           props: TemplateHeroFields
         ) {
           return (
             <section>
               <h1>{props.title}</h1>
               <RichText data={props.body} />
               <Image {...props.image} />
             </section>
           );
         }
       caption: "Render with generated TypeScript types."
       _arrayKey: "1i5Q8n"
     - code: |-
         import {cmsRoute} from '@/utils/cms-route.js';
         import {Page} from '@/components/Page.js';

         export default Page;

         // Drafts for editors, published for everyone.
         export const {handle} = cmsRoute({
           collection: 'Pages',
           slugParam: 'page',
         });
       filename: "routes/[[...page]].tsx"
       caption: "Map a collection to a route."
       language: "tsx"
       _arrayKey: "Mu1JS3"
   title: "Your content model lives in your repo"
   _type: "TemplateCodeShowcase"
   _arrayKey: "Cs58HH"
 - title: "Drafts, releases, and pre-publish checks"
   id: "publishing"
   eyebrow: "Publishing"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Edit in drafts, then publish immediately, schedule a launch time, or group multiple docs into a single release. Custom checks run before anything goes live so broken links or missing fields don’t slip through."
     version: "2.28.2"
     time: 1790635986282
   _type: "TemplateFeatureSpotlight"
   options:
-    - "layout:image-left"
+    - "theme:tint"
   image:
     filename: "cms-publish-checks.png"
     uploadedBy: "stevenle08@gmail.com"
     uploadedAt: "1793643618595"
     width: 1920
     height: 1440
     src: "https://lh3.googleusercontent.com/ujgxG13upwYOOMnvqpKTq10_mMhI8lvIEuAjkU8uEYzgexPIFu_mlzEmv8mPQ3xW1cYZ_bFs0DWYRrHWd7YPSO9qT3c3XXgeQIo"
     gcsPath: "/rootjs-dev.appspot.com/www/uploads/fbd25177293ac55d585fb25dc05633baa29b1aee.png"
     alt: "The publish dialog in Root CMS, showing a scheduled publish time, an AI-written change summary and passing publishing checks."
     assetId: "LnkYyucG2I7Y"
   highlights:
     - text: "Field-by-field diffs and publish notes"
       _arrayKey: "GPzwOg"
     - text: "Group multiple docs into scheduled releases"
       _arrayKey: "eAgHS0"
     - text: "Custom checks for missing translations, accessibility, and broken links"
       _arrayKey: "wzBLb7"
   _arrayKey: "h56ZKX"
 - eyebrow: "Localization"
   _type: "TemplateFeatureSpotlight"
   options:
-    - "theme:tint"
+    - "layout:image-left"
   body:
     version: "lexical-0.31.2"
     blocks:
       - data:
           text: "Mark fields as translatable in your schema and Root.js tracks every string across your site. Edit translations in the CMS, generate drafts with AI, or send them to a vendor, with localized URLs, fallbacks, and hreflang tags handled automatically."
         type: "paragraph"
     time: 1790642306684
   title: "Localization from schema to URL"
   id: "localization"
   image:
     filename: "cms-translations.png"
     uploadedBy: "stevenle08@gmail.com"
     uploadedAt: "1793643632813"
     width: 1920
     height: 1200
     src: "https://lh3.googleusercontent.com/R8SK0-6o_l4BdoSAXd1Wq2YINrogCNMjGDydD5R7bolZPZsW5YVCvEVXZz_O3ogMy4MWU8HM7EOdAeLUIELn6RFgdZK3falsXQ"
     gcsPath: "/rootjs-dev.appspot.com/www/uploads/45e4f6689fe47ccea407acd43e34eb382cb9ef02.png"
     alt: "The Root CMS translations editor for a page, with source strings alongside German, French and Japanese translations and an AI translate action."
     assetId: "E3IUqogZ1CAR"
   highlights:
     - text: "Per-page translation editor with missing-string alerts"
       _arrayKey: "p0x9dy"
     - text: "Import and export CSV, Google Sheets, and ARB"
       _arrayKey: "aIFCgc"
     - text: "Connect third-party translation providers like Crowdin"
       _arrayKey: "d2mvgM"
   _arrayKey: "erjGXp"
 - id: "collaboration"
   _type: "TemplateFeatureSpotlight"
   eyebrow: "Collaboration"
   highlights:
     - text: "Live presence and real-time updates"
       _arrayKey: "hCnr0k"
     - text: "Field-level comment threads with @mentions"
       _arrayKey: "dfVrDg"
     - text: "Email and custom notification settings"
       _arrayKey: "u0RuPt"
   options:
-    - "layout:image-left"
+    - "theme:tint"
   title: "Edit together and comment on any field"
   image:
     filename: "cms-field-comments.png"
     uploadedBy: "stevenle08@gmail.com"
     uploadedAt: "1793643611814"
     width: 1920
     height: 1200
     src: "https://lh3.googleusercontent.com/VLDpSlxfuGOLAKdoimBw_r7aw6dQgH57OtNCdwkQZJQ5YxzrUo8195EWXzLiy6QqO9CprW_iS1KMXwDXVGtpxjVw3AaUlMdzOPo"
     gcsPath: "/rootjs-dev.appspot.com/www/uploads/eca906eaa029e52a3d10d0793e09c2a30d45355a.png"
     alt: "A comment thread pinned to a field in the Root CMS editor, with teammates discussing a headline and an @mention."
     assetId: "0GauFmHwNpCx"
   body:
     time: 1793723679918
     blocks:
       - type: "paragraph"
         data:
           text: "See who else has a doc open, get their edits in real time, and leave comment threads directly on individual fields with @mentions."
     version: "lexical-0.31.2"
   _arrayKey: "jQagyo"
 - id: "framework"
   _type: "TemplateFeatureGrid"
   eyebrow: "The framework"
-  options:
-    - "theme:tint"
   title: "Static or server-rendered, built on Vite"
   items:
     - title: "Server-rendered TSX"
       icon: "server"
       body: "Render on the server or pre-build static HTML, sending zero client JavaScript unless a page needs it."
       _arrayKey: "IBvd0T"
     - title: "Web component islands"
       body: "Add interactivity with standard custom elements. Only the components used on a page load their scripts."
       icon: "components"
       _arrayKey: "GA9V6X"
     - title: "File-based routing"
       icon: "route"
       body: "Map files in routes/ directly to URLs, with support for dynamic params, catch-alls, and custom handlers."
       _arrayKey: "3svyQ0"
     - icon: "i18n"
       body: "Localized URLs, locale fallbacks, and hreflang sitemaps are wired into the router."
       title: "Built-in i18n"
       _arrayKey: "sQCEJk"
     - title: "Plugins & pods"
       body: "Extend the server, build, or CMS with plugins, or package routes and schemas as reusable pods."
       icon: "plug"
       _arrayKey: "UwUBX8"
     - title: "Deploy anywhere"
       icon: "rocket"
       body: "Deploy to Firebase, App Engine, or any Node host, with secrets synced from Google Secret Manager."
       _arrayKey: "d78s5B"
   body: "Use the same setup for marketing pages, docs, and blogs, built directly on TypeScript, TSX, and Vite."
   _arrayKey: "bYD6Eg"
 - _type: "TemplateFeatureGrid"
   items:
     - title: "Version history"
       body: "Compare past versions side by side, restore an earlier draft, or copy fields from history."
       icon: "history"
       _arrayKey: "25jVaD"
     - body: "Run required or advisory checks before publishing to validate links, metadata, or translations."
       icon: "checks"
       title: "Publishing checks"
       _arrayKey: "KqrzKW"
-    - body: "Script content updates from CI or AI agents, with change proposals your team reviews in the CMS."
+    - body: "Update content and prototypes from CI or agent harnesses like Antigravity and Claude Code, with team review in the CMS."
       icon: "proposal"
       title: "Agent-ready CLI"
       _arrayKey: "usGtHH"
     - title: "Asset library"
       icon: "assets"
       body: "Organize images and files in folders, sync them from Figma or Google Drive, and serve resized variants."
       _arrayKey: "IJ8avz"
     - icon: "data"
       title: "Data sources"
       body: "Sync data from Google Sheets or external APIs and publish snapshots alongside your pages."
       _arrayKey: "1P1uuv"
     - title: "Roles & locks"
       icon: "lock"
       body: "Control access with project roles, collection permission groups, and document publish locks."
       _arrayKey: "IMPoMl"
     - icon: "palette"
       title: "Customizable UI"
       body: "Add custom sidebar tools, themes, and notification hooks, or embed the editor in your own app."
       _arrayKey: "aKg0Rk"
     - title: "Global search"
       body: "Jump to any doc, field, or translated string from anywhere in the CMS with ⌘K."
       icon: "search"
       _arrayKey: "df8Otn"
   eyebrow: "Inside the CMS"
   id: "features"
   title: "More tools built into the CMS"
   options:
+    - "theme:tint"
     - "columns:4"
   _arrayKey: "aLMiJZ"
 - title: "Meet the team behind Root.js"
   buttons:
     - options:
         - "variant:primary"
       label: "About the team"
       href: "https://blinkk.com/about/?utm_source=rootjs&utm_medium=website&utm_campaign=rootjs-upsell"
       _arrayKey: "d09klD"
     - label: "Explore solutions"
       options:
         - "variant:outline"
       href: "https://blinkk.com/services/?utm_source=rootjs&utm_medium=website&utm_campaign=rootjs-upsell"
       _arrayKey: "rz1dnO"
   id: "contact-us"
   eyebrow: "Contact us"
   _type: "TemplateHero"
   options:
     - "theme:dark"
     - "title:h2"
   command: ""
   body:
     time: 1795304527465
     blocks:
       - type: "paragraph"
         data:
           text: "Root.js was handcrafted by the team at <a href=\"https://blinkk.com\">Blinkk</a>. We offer custom solutions and forward deployments, including full integration and maintenance of Root.js sites on infrastructure that you own."
     version: "lexical-0.31.2"
   _arrayKey: "qSV88L"
```
