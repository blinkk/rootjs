# Feature Design Prototypes on the rootjs.dev homepage and guides

- **id:** `2026-11-22-design-prototypes-website`
- **version:** 1
- **author:** docs/cms-proposals

## Summary

- Pages/index: Add a Design Prototypes feature spotlight right after Root AI (with the cms-design-prototypes.png screenshot), add "Read the guide" buttons to all 5 spotlight sections, update the Automate pillar and Agent-ready CLI card, and re-balance alternating section themes/layouts.
- Guides/design-prototypes: Add a non-technical guide introducing Design Prototypes with the cms-design-prototypes.png hero and card screenshot.

## Edit `Pages/index`

Add the Design Prototypes spotlight module with its screenshot, add "Read the guide" buttons to all five feature spotlights, and update the Automate pillar and Agent-ready CLI card.

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
+        - text: "Design and iterate on new pages and components"
+          _arrayKey: "pR0t01"
+        - text: "Chat with docs, schemas, and releases in the CMS"
           _arrayKey: "zJuPYx"
-        - text: "Bring your own model provider"
+        - text: "Bring your own model provider or AI coding tool"
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
+      body: "Use Root AI in the CMS—or connect tools like Antigravity and Claude Code—to design new pages, draft and translate content, and ship under your team’s review."
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
+  buttons:
+    - label: "Read the guide"
+      href: "/guides/root-ai/"
+      options:
+        - "variant:outline"
+      _arrayKey: "aiBtn1"
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
+          text: "Explore new pages and components on a shared artboard with Root AI, which already understands your site’s design system. Update prototypes directly in the CMS or from your favorite agent harness—like Antigravity or Claude Code—gather feedback from your team, and turn approved mocks into production-ready components."
+  highlights:
+    - text: "Root AI designs with your site’s styles and existing components"
+      _arrayKey: "dpH1g1"
+    - text: "Iterate in the CMS or from Antigravity, Claude Code, and other agent harnesses"
+      _arrayKey: "dpH1g2"
+    - text: "Turn reviewed, approved mocks directly into production-ready components"
+      _arrayKey: "dpH1g3"
+  buttons:
+    - label: "Read the guide"
+      href: "/guides/design-prototypes/"
+      options:
+        - "variant:outline"
+      _arrayKey: "dpBtn1"
+  image:
+    assetId: "rxXoK0rvwfAq"
+    filename: "cms-design-prototypes.png"
+    src: "https://lh3.googleusercontent.com/RYcWRzpJGtbHia6XFtw2tMbEyYB5l4ZAkWU8q_gXIkMcFEYfxoMFPurMFLo5hawK0lqRXykSU9oaFJYozC6WGEor-GrL-JX9"
+    width: 1920
+    height: 1200
+    alt: "Design Prototypes in the Root.js CMS: desktop and mobile page concepts for Fernwood Market on a shared artboard, with floating canvas tools, a team comment, and the floating Root AI card."
+    gcsPath: "/rootjs-dev.appspot.com/www/uploads/3586abcfaa181955b07421f23b02c0b7fbe196b5.png"
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
+  buttons:
+    - label: "Read the guide"
+      href: "/guides/publishing/"
+      options:
+        - "variant:outline"
+      _arrayKey: "pbBtn1"
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
+  buttons:
+    - label: "Read the guide"
+      href: "/guides/localization/"
+      options:
+        - "variant:outline"
+      _arrayKey: "lcBtn1"
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
+  buttons:
+    - label: "Read the guide"
+      href: "/guides/collaboration/"
+      options:
+        - "variant:outline"
+      _arrayKey: "clBtn1"
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

## Create `Guides/design-prototypes`

New non-technical guide for Design Prototypes with the uploaded cms-design-prototypes.png screenshot.

```yaml
meta:
  title: "Design Prototypes"
  description: "Design and iterate on new pages and components with Root AI, gather team feedback, and turn approved mocks into production-ready code."
  image: &a1
    assetId: "rxXoK0rvwfAq"
    filename: "cms-design-prototypes.png"
    src: "https://lh3.googleusercontent.com/RYcWRzpJGtbHia6XFtw2tMbEyYB5l4ZAkWU8q_gXIkMcFEYfxoMFPurMFLo5hawK0lqRXykSU9oaFJYozC6WGEor-GrL-JX9"
    width: 1920
    height: 1200
    alt: "Design Prototypes in the Root.js CMS: desktop and mobile page concepts for Fernwood Market on a shared artboard, with floating canvas tools, a team comment, and the floating Root AI card."
    gcsPath: "/rootjs-dev.appspot.com/www/uploads/3586abcfaa181955b07421f23b02c0b7fbe196b5.png"
content:
  eyebrow: "Design Prototypes"
  title: "From first concept to production-ready components"
  intro:
    blocks:
      - type: "paragraph"
        data:
          text: "Planning a new landing page or component usually means bouncing between slide decks, static mockups, and long handoff threads before anyone sees how the idea fits the real site. Design Prototypes brings that exploration into Root.js."
      - type: "paragraph"
        data:
          text: "Your team can sketch and iterate on new pages on a shared artboard with Root AI—which already understands your site’s design system—or update prototypes from external agent harnesses like Antigravity and Claude Code. Once a concept is reviewed and approved, your harness can convert it straight into production-ready components."
    time: 1795401200000
    version: "2.28.2"
  heroImage: *a1
  takeaways:
    - text: "Design new pages and components with Root AI using your existing design system."
      _arrayKey: "dpTk01"
    - text: "Compare desktop and mobile concepts side by side on a shared artboard."
      _arrayKey: "dpTk02"
    - text: "Update prototypes in the CMS or from agent harnesses like Antigravity and Claude Code."
      _arrayKey: "dpTk03"
    - text: "Collect and resolve team feedback directly on the prototype."
      _arrayKey: "dpTk04"
    - text: "Convert approved mocks into production-ready components."
      _arrayKey: "dpTk05"
  sections:
    - id: "design-system-aware"
      title: "Built around your design system"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Instead of starting from generic wireframes, Root AI understands your site’s existing styles, layout patterns, and components. Teams can combine real site sections with proposed new components on the same artboard, so stakeholders immediately see how a new page or feature fits the rest of the website."
        time: 1795401200000
        version: "2.28.2"
      _arrayKey: "dpSc01"
    - id: "iterate-anywhere"
      title: "Iterate in the CMS or your favorite agent harness"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Designers, marketers, and product owners can prompt Root AI directly in the CMS to adjust layouts, try copy variations, or compare desktop and mobile views side by side."
          - type: "paragraph"
            data:
              text: "Developers and designers who prefer working in their own AI coding tools—such as Antigravity or Claude Code—can update the exact same prototype boards from their local workflow, keeping everyone looking at the latest concept in one place."
        time: 1795401200000
        version: "2.28.2"
      _arrayKey: "dpSc02"
    - id: "review-together"
      title: "Review and align before building"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Anyone with access to the CMS can open a prototype, leave feedback directly on a frame or section, and resolve comments as decisions are made. Because prototypes stay separate from your live pages, teams can explore bold ideas freely without risking live content."
        time: 1795401200000
        version: "2.28.2"
      _arrayKey: "dpSc03"
    - id: "ship-to-production"
      title: "Turn approved mocks into production components"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Once a mock is reviewed and approved, nothing has to be rebuilt from scratch from screenshots. Agent harnesses like Antigravity and Claude Code can read the approved prototype and convert it into production-ready Root.js templates, schemas, and styles for your team to review and ship."
        time: 1795401200000
        version: "2.28.2"
      _arrayKey: "dpSc04"
  faq:
    - question: "Can prototypes affect our live website?"
      answer: "No. Prototypes live in their own workspace, separate from your site’s published pages and drafts. Nothing goes live until your team builds and publishes it through your normal workflow."
      _arrayKey: "dpFq01"
    - question: "Can we update prototypes outside the CMS?"
      answer: "Yes. Non-technical teammates can iterate with Root AI directly in the CMS, while developers can update the same prototype boards from external agent harnesses like Antigravity or Claude Code."
      _arrayKey: "dpFq02"
    - question: "How do approved prototypes become real pages?"
      answer: "Once your team signs off on a prototype, a developer can point an agent harness at the approved board to generate the matching Root.js components and schemas, review the code in a pull request, and ship it like any other site update."
      _arrayKey: "dpFq03"
```
