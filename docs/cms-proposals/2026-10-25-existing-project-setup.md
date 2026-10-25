# Update the developer docs: index

- **id:** `2026-10-25-existing-project-setup`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-25T05:09:05.486Z

## Summary

- Docs/index: Adds a section on setting up a cloned project on a new machine, with a prompt for the root-dev-setup agent skill, and points the AI agents section at that skill instead of `root-cms setup`.

## Edit `Docs/index`

Adds a section on setting up a cloned project on a new machine, with a prompt for the root-dev-setup agent skill, and points the AI agents section at that skill instead of `root-cms setup`.

### Set `content.sections`

```diff yaml
 - id: "overview"
   title: "Overview"
   body:
-    version: "2.28.2"
-    time: 1790907822269
     blocks:
-      - data:
+      - type: "paragraph"
+        data:
           text: "Root.js is a web platform for building content-driven websites. It pairs a TypeScript web framework with a built-in CMS, so developers, writers and translators can work on the same site."
-        type: "paragraph"
-      - data:
-          items:
-            - items: []
-              content: "<b>The framework</b> renders TSX on the server, either on demand (SSR) or ahead of time as static HTML (SSG). It's built on <a href=\"https://vite.dev/\">Vite</a>, and it ships no client-side JavaScript unless you add it."
-            - items: []
-              content: "<b>The CMS</b> adds visual editing with live preview, localization, releases and publishing workflows. Content is stored in your own <a href=\"https://firebase.google.com/\">Firebase</a> project, and content models are defined in code."
+      - type: "unorderedList"
+        data:
           style: "unordered"
-        type: "unorderedList"
+          items:
+            - content: "<b>The framework</b> renders TSX on the server, either on demand (SSR) or ahead of time as static HTML (SSG). It's built on <a href=\"https://vite.dev/\">Vite</a>, and it ships no client-side JavaScript unless you add it."
+              items: []
+            - content: "<b>The CMS</b> adds visual editing with live preview, localization, releases and publishing workflows. Content is stored in your own <a href=\"https://firebase.google.com/\">Firebase</a> project, and content models are defined in code."
+              items: []
+    time: 1790907822269
+    version: "2.28.2"
   blocks: []
   _arrayKey: "8taeI7"
-- body:
+- id: "requirements"
+  title: "Requirements"
+  body:
     blocks:
-      - data:
+      - type: "unorderedList"
+        data:
+          style: "unordered"
           items:
             - content: "<a href=\"https://nodejs.org/\">Node.js</a> 24 (the current LTS) or later."
               items: []
-            - items: []
-              content: "A package manager. We recommend <a href=\"https://pnpm.io/\">pnpm</a>, which you can enable with Corepack."
+            - content: "A package manager. We recommend <a href=\"https://pnpm.io/\">pnpm</a>, which you can enable with Corepack."
+              items: []
             - content: "For the CMS: the <a href=\"https://cloud.google.com/sdk/docs/install\">gcloud CLI</a> and a Google Cloud billing account. The CMS needs Secret Manager and a storage bucket, which require billing, but low-traffic sites usually stay in the free tier."
               items: []
-          style: "unordered"
-        type: "unorderedList"
     time: 1790907822269
     version: "2.28.2"
-  id: "requirements"
-  title: "Requirements"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         node --version  # v24 or later
         corepack enable
       _arrayKey: "zkXDad"
   _arrayKey: "xmeqk6"
-- blocks:
-    - code: |-
+- id: "ai-setup"
+  title: "Set up with an AI agent"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "The quickest way to a working site is to let a coding agent (such as <a href=\"https://claude.com/claude-code\">Claude Code</a>) run the steps on this page for you. Start it in the folder where you keep your projects and paste this prompt:"
+    time: 1790910943919
+    version: "2.28.2"
+  blocks:
+    - _type: "CodeBlock"
+      code: |-
         Set up a new Root.js site. Follow the instructions at
         https://rootjs.dev/skills/root-cms-setup.md
-      _type: "CodeBlock"
       _arrayKey: "iORHv6"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The agent asks a few questions up front: the folder name, whether to use a new or existing Google Cloud project, and a site id. It then creates the project, runs <code>root-cms setup</code> (after showing you a dry run), starts the dev server and installs the Root.js skills, so later sessions know how to work with your content."
-          - data:
+          - type: "paragraph"
+            data:
               text: "A few steps need you, because they happen in a browser or pick who pays: signing in with <code>gcloud</code>, choosing a billing account for a new project, and turning on Google sign-in in the Firebase console. The agent tells you when."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "If you'd rather do it yourself, the rest of this page covers the same steps."
-            type: "paragraph"
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "IndPTA"
-  id: "ai-setup"
-  title: "Set up with an AI agent"
+  _arrayKey: "QTrLzB"
+- id: "existing-project"
+  title: "Set up an existing project"
   body:
-    time: 1790910943919
     blocks:
       - type: "paragraph"
         data:
-          text: "The quickest way to a working site is to let a coding agent (such as <a href=\"https://claude.com/claude-code\">Claude Code</a>) run the steps on this page for you. Start it in the folder where you keep your projects and paste this prompt:"
-    version: "lexical-0.31.2"
-  _arrayKey: "QTrLzB"
-- title: "Create a project"
-  id: "create-project"
+          text: "If you're joining a team whose site is already set up, you don't need <code>root-cms setup</code>. Clone the repo, open an agent in it, and paste this prompt:"
+    time: 1792904944718
+    version: "2.28.2"
   blocks:
-    - language: "bash"
-      _type: "CodeBlock"
+    - _type: "CodeBlock"
+      code: |-
+        Set up this Root.js project on my machine. Follow the instructions at
+        https://rootjs.dev/skills/root-dev-setup.md
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "The agent checks Node.js, pnpm and <code>gcloud</code>, asks you to sign in to Google Cloud, installs the dependencies, downloads the team's shared secrets into <code>.env</code>, checks that you can reach the CMS and starts the dev server. It doesn't change the project's Google Cloud setup; if you're missing access, it tells you what to ask for."
+          - type: "paragraph"
+            data:
+              text: "To do it yourself:"
+        time: 1792904944718
+        version: "2.28.2"
+    - _type: "CodeBlock"
+      language: "bash"
+      code: |-
+        pnpm install
+
+        # Sign in with the account your team added to the project. Both open a browser.
+        gcloud auth login
+        gcloud auth application-default login
+
+        # Downloads the shared secrets into .env, then starts the server.
+        pnpm dev
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "To use the CMS, you need access to the site's Google Cloud project (for Firestore and Secret Manager) and a role in the CMS, which an admin adds under <b>Settings</b>. If Firestore returns <code>PERMISSION_DENIED</code> locally, run <code>gcloud auth application-default set-quota-project &lt;project-id&gt;</code>."
+        time: 1792904944718
+        version: "2.28.2"
+- id: "create-project"
+  title: "Create a project"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "Scaffold a new project from the <a href=\"https://github.com/blinkk/rootjs/tree/main/examples/starter\">starter</a> template:"
+    time: 1790907822269
+    version: "2.28.2"
+  blocks:
+    - _type: "CodeBlock"
+      language: "bash"
       code: "pnpm create @blinkk/root my-site"
       _arrayKey: "MrXXXB"
-    - body:
-        version: "2.28.2"
+    - _type: "CopyBlock"
+      body:
         blocks:
-          - data:
+          - type: "paragraph"
+            data:
               text: "It offers to install the dependencies and set up Google Cloud for the CMS right away. Say yes to run the setup wizard described <a href=\"#set-up-cms\">below</a>, or say no and run it later. Either way, start the dev server from the new folder:"
-            type: "paragraph"
         time: 1790907822269
-      _type: "CopyBlock"
+        version: "2.28.2"
       _arrayKey: "IdBrxL"
     - _type: "CodeBlock"
+      language: "bash"
       code: |-
         cd my-site
         pnpm install
         pnpm dev
-      language: "bash"
       _arrayKey: "goWmW4"
-    - body:
+    - _type: "CopyBlock"
+      body:
         blocks:
-          - data:
+          - type: "paragraph"
+            data:
               text: "The site runs at <a href=\"http://localhost:4007\">http://localhost:4007</a>, and pages reload as you edit them. To use a different port, set the <code>PORT</code> environment variable."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "The starter comes with the CMS, a <code>Pages</code> collection, and a route that builds each page from a list of templates:"
-            type: "paragraph"
-          - data:
+          - type: "html"
+            data:
               html: |-
                 <pre><code>my-site/
                 ├── collections/
                 │   └── Pages.schema.ts   # The Pages collection
                 ├── components/
                 │   └── PageModules/      # Renders each module with its template
                 ├── layouts/
                 │   └── BaseLayout.tsx    # &lt;html&gt;, &lt;head&gt;, header and footer
                 ├── routes/
                 │   ├── [[...slug]].tsx   # Renders Pages docs by slug
                 │   └── 404.tsx
                 ├── templates/
                 │   └── TemplateHero/     # TemplateHero.schema.ts, .tsx, .module.scss
                 ├── root-cms.d.ts         # Generated types for your schemas
                 └── root.config.ts</code></pre>
-            type: "html"
-          - data:
+          - type: "paragraph"
+            data:
               text: "Until the CMS is connected to Google Cloud, the home page shows the setup steps."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "<b>Just the framework?</b> The <a href=\"https://github.com/blinkk/rootjs/tree/main/examples/minimal\">minimal</a> template is a plain Root.js project with a single \"Hello, Root.js\" page at <code>routes/index.tsx</code>, and no CMS. It's a good fit for static sites. To add the CMS to it later, install <code>@blinkk/root-cms</code> and <code>firebase-admin</code>, and add <code>cmsPlugin()</code> as described in <a href=\"/docs/cms/\">CMS configuration</a>:"
-            type: "paragraph"
-        version: "2.28.2"
         time: 1790907822269
-      _type: "CopyBlock"
+        version: "2.28.2"
       _arrayKey: "zmkD1g"
-    - code: "pnpm create @blinkk/root --template=minimal my-site"
-      _type: "CodeBlock"
+    - _type: "CodeBlock"
       language: "bash"
+      code: "pnpm create @blinkk/root --template=minimal my-site"
       _arrayKey: "dhjQag"
-  body:
-    time: 1790907822269
-    version: "2.28.2"
-    blocks:
-      - type: "paragraph"
-        data:
-          text: "Scaffold a new project from the <a href=\"https://github.com/blinkk/rootjs/tree/main/examples/starter\">starter</a> template:"
   _arrayKey: "CV6MrI"
 - id: "set-up-cms"
+  title: "Connect the CMS to Google Cloud"
   body:
-    time: 1790907822269
     blocks:
       - type: "paragraph"
         data:
           text: "The CMS runs inside your site at <code>/cms/</code> and stores content in Firestore, in a Google Cloud project you own. The <code>root-cms setup</code> wizard sets up that project. If you said yes in <code>create-root</code>, it has already run; otherwise run it from your project:"
+    time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm exec root-cms setup"
       _arrayKey: "2t4INX"
     - _type: "CopyBlock"
       body:
-        version: "2.28.2"
         blocks:
           - type: "paragraph"
             data:
               text: "It asks for a new or existing project and a site id, then:"
-          - data:
+          - type: "unorderedList"
+            data:
               style: "unordered"
               items:
                 - content: "Signs you in with <code>gcloud</code>, if needed, and links a billing account."
                   items: []
-                - items: []
-                  content: "Adds Firebase, creates the Firestore database and storage bucket, and applies the CMS's security rules."
+                - content: "Adds Firebase, creates the Firestore database and storage bucket, and applies the CMS's security rules."
+                  items: []
                 - content: "Makes you an ADMIN of the CMS."
                   items: []
-                - items: []
-                  content: "Creates a service account for the site to run as in production."
-                - items: []
-                  content: "Stores a session secret in Secret Manager, and creates a <code>.root.secrets.json</code> manifest to commit (see <a href=\"#secrets\">Share environment variables</a>)."
-                - items: []
-                  content: "Writes the site id and Firebase config into <code>root.config.ts</code>."
-            type: "unorderedList"
-          - data:
+                - content: "Creates a service account for the site to run as in production."
+                  items: []
+                - content: "Stores a session secret in Secret Manager, and creates a <code>.root.secrets.json</code> manifest to commit (see <a href=\"#secrets\">Share environment variables</a>)."
+                  items: []
+                - content: "Writes the site id and Firebase config into <code>root.config.ts</code>."
+                  items: []
+          - type: "paragraph"
+            data:
               text: "One step is manual, because Google has no API for it: the wizard asks you to turn on Google sign-in in the Firebase console, links you to the page, and checks that it worked."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "The site id keeps this site's content, uploads and secrets apart, so several sites can share one Google Cloud project. The wizard is safe to run again: it skips anything that's already set up, so if a step fails, fix it and re-run. Pass <code>--dry-run</code> to see what it would change first."
-            type: "paragraph"
           - type: "paragraph"
             data:
               text: "<b>Create your home page</b>"
-          - data:
+          - type: "paragraph"
+            data:
               text: "Restart the dev server and open <a href=\"http://localhost:4007/cms/\">http://localhost:4007/cms/</a>. In the <code>Pages</code> collection, create a doc with the slug <code>index</code>, add a <b>TemplateHero</b> module, and publish it. It replaces the setup page at <code>/</code>. Other slugs map to their own URL, e.g. <code>about</code> renders at <code>/about</code>."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "To set up Firebase without the wizard, or to see every option the CMS supports, see <a href=\"/docs/cms/\">CMS configuration</a>."
-            type: "paragraph"
         time: 1790907822269
+        version: "2.28.2"
       _arrayKey: "sxfBWQ"
-  title: "Connect the CMS to Google Cloud"
   _arrayKey: "ESj5dh"
-- title: "Build pages from templates"
+- id: "templates"
+  title: "Build pages from templates"
   body:
-    version: "2.28.2"
-    time: 1790907822269
     blocks:
       - type: "paragraph"
         data:
           text: "Each page in the starter is a list of modules. The <code>Pages</code> collection offers every template schema in the <code>templates/</code> folder with <code>schema.glob()</code>:"
+    time: 1790907822269
+    version: "2.28.2"
   blocks:
-    - code: |-
+    - _type: "CodeBlock"
+      language: "ts"
+      code: |-
         // @/collections/Pages.schema.ts

         schema.array({
           id: 'modules',
           label: 'Modules',
           of: schema.oneOf({
             // Every `templates/<Name>/<Name>.schema.ts` file is available here.
             types: schema.glob('/templates/*/*.schema.ts'),
           }),
         }),
-      _type: "CodeBlock"
-      language: "ts"
       _arrayKey: "RFBn03"
-    - body:
+    - _type: "CopyBlock"
+      body:
         blocks:
-          - data:
+          - type: "paragraph"
+            data:
               text: "The route at <code>routes/[[...slug]].tsx</code> loads the doc for the URL with <code>RootCMSClient</code>, and <code>PageModules</code> renders each module with the component that matches its template name. Editors can preview drafts by adding <code>?preview=true</code> to the URL."
-            type: "paragraph"
-          - data:
+          - type: "paragraph"
+            data:
               text: "To add a template, create a folder in <code>templates/</code> with a schema and a component of the same name. For example, here's the starter's <code>TemplateHero</code> template:"
-            type: "paragraph"
         time: 1790907822269
         version: "2.28.2"
-      _type: "CopyBlock"
       _arrayKey: "BHWEvd"
     - _type: "CodeBlock"
+      language: "ts"
       code: |-
         // @/templates/TemplateHero/TemplateHero.schema.ts

         import {schema} from '@blinkk/root-cms';

         export default schema.define({
           name: 'TemplateHero',
           description: 'Large page heading with an optional image.',
           fields: [
             schema.string({
               id: 'title',
               label: 'Title',
               translate: true,
             }),
             schema.string({
               id: 'body',
               label: 'Body',
               translate: true,
               variant: 'textarea',
             }),
             schema.image({
               id: 'image',
               label: 'Image',
             }),
           ],
         });
-      language: "ts"
       _arrayKey: "Ke9ZSv"
-    - code: |-
+    - _type: "CodeBlock"
+      language: "tsx"
+      code: |-
         // @/templates/TemplateHero/TemplateHero.tsx

         import {useTranslations} from '@blinkk/root';
         import {TemplateHeroFields} from '@/root-cms.js';
         import styles from './TemplateHero.module.scss';

         export function TemplateHero(props: TemplateHeroFields) {
           const t = useTranslations();
           return (
             <section className={styles.hero}>
               {props.title && <h1 className={styles.title}>{t(props.title)}</h1>}
               {props.body && <p className={styles.body}>{t(props.body)}</p>}
               {props.image?.src && (
                 <img
                   className={styles.image}
                   src={props.image.src}
                   width={props.image.width}
                   height={props.image.height}
                   alt={props.image.alt || ''}
                 />
               )}
             </section>
           );
         }
-      language: "tsx"
-      _type: "CodeBlock"
       _arrayKey: "USmk16"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Then regenerate the TypeScript types for your schemas. The new template shows up in the CMS the next time you open it:"
-        version: "2.28.2"
         time: 1790907822269
+        version: "2.28.2"
       _arrayKey: "kI0fzg"
-    - language: "bash"
+    - _type: "CodeBlock"
+      language: "bash"
       code: "pnpm exec root-cms generate-types"
-      _type: "CodeBlock"
       _arrayKey: "CkTgw3"
-    - body:
+    - _type: "CopyBlock"
+      body:
         blocks:
           - type: "paragraph"
             data:
               text: "Learn more in <a href=\"/docs/cms/schemas/\">Schemas</a> and <a href=\"/docs/cms/data-fetching/\">Data fetching</a>."
-        version: "2.28.2"
         time: 1790907822269
-      _type: "CopyBlock"
+        version: "2.28.2"
       _arrayKey: "VCbcgZ"
-  id: "templates"
   _arrayKey: "tIVuJP"
-- blocks:
+- id: "secrets"
+  title: "Share environment variables"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "API keys and other secrets belong in a <code>.env</code> file, which shouldn't be committed. To share them with your team, <code>root secrets</code> stores them in <a href=\"https://cloud.google.com/secret-manager\">Google Cloud Secret Manager</a> and keeps each developer's <code>.env</code> in sync. <code>root-cms setup</code> creates the <code>.root.secrets.json</code> manifest for you; for a project without the CMS, create it with <code>root secrets init</code>:"
+    time: 1790907822269
+    version: "2.28.2"
+  blocks:
     - _type: "CodeBlock"
+      language: "bash"
       code: |-
         # Create a manifest (.root.secrets.json) and commit it.
         pnpm exec root secrets init --gcp-project=my-project --gsm-key=my-site-env

         # Upload the values in your .env file.
         pnpm exec root secrets push

         # Teammates download them into their own .env.
         pnpm exec root secrets sync
-      language: "bash"
       _arrayKey: "uVTXGP"
     - _type: "CopyBlock"
       body:
-        time: 1790907822269
-        version: "2.28.2"
         blocks:
           - type: "paragraph"
             data:
               text: "Once a project has a manifest, <code>root dev</code> syncs the secrets when it starts. See the <a href=\"/docs/cli/#root-secrets\">CLI reference</a> for every command."
+        time: 1790907822269
+        version: "2.28.2"
       _arrayKey: "VMSNYo"
-  title: "Share environment variables"
-  body:
-    blocks:
-      - data:
-          text: "API keys and other secrets belong in a <code>.env</code> file, which shouldn't be committed. To share them with your team, <code>root secrets</code> stores them in <a href=\"https://cloud.google.com/secret-manager\">Google Cloud Secret Manager</a> and keeps each developer's <code>.env</code> in sync. <code>root-cms setup</code> creates the <code>.root.secrets.json</code> manifest for you; for a project without the CMS, create it with <code>root secrets init</code>:"
-        type: "paragraph"
-    version: "2.28.2"
-    time: 1790907822269
-  id: "secrets"
   _arrayKey: "jpg2Yq"
 - id: "ai-agents"
   title: "Work with AI agents"
   body:
-    version: "2.28.2"
-    time: 1790907822269
     blocks:
       - type: "paragraph"
         data:
           text: "Root.js includes skills that teach AI coding agents, such as Claude Code, how to set up the CMS and how to read and edit your content from the command line. If an agent set up your project, they're already installed. Otherwise, install them into your project and commit them:"
+    time: 1790907822269
+    version: "2.28.2"
   blocks:
-    - language: "bash"
+    - _type: "CodeBlock"
+      language: "bash"
       code: "pnpm exec root-cms skill.install"
-      _type: "CodeBlock"
       _arrayKey: "NxYnWE"
     - _type: "CopyBlock"
       body:
-        time: 1790907822269
-        version: "2.28.2"
         blocks:
           - type: "paragraph"
             data:
               text: "With the skills installed, you can ask an agent to:"
-          - data:
+          - type: "unorderedList"
+            data:
+              style: "unordered"
               items:
                 - content: "Look up or update content, e.g. \"list the pages that don't have a meta description\"."
                   items: []
-                - items: []
-                  content: "Propose content changes as a YAML file that your team reviews in a pull request, then applies with <code>root-cms proposal.apply</code>."
-                - content: "Connect a teammate's checkout, or a new environment, to Google Cloud with <code>root-cms setup</code>."
+                - content: "Propose content changes as a YAML file that your team reviews in a pull request, then applies with <code>root-cms proposal.apply</code>."
                   items: []
-              style: "unordered"
-            type: "unorderedList"
-          - data:
+                - content: "Set up a fresh clone of the project on a teammate's machine: tools, <code>gcloud</code> sign-in, shared secrets and CMS access (see <a href=\"#existing-project\">Set up an existing project</a>)."
+                  items: []
+          - type: "paragraph"
+            data:
               text: "The skills install to an existing agent skills folder, such as <code>.claude/skills</code>, or to <code>.agent/skills</code> if there isn't one. Re-run the command with <code>--force</code> after upgrading <code>@blinkk/root-cms</code> to pick up new versions."
-            type: "paragraph"
+        time: 1790907822269
+        version: "2.28.2"
       _arrayKey: "5L5sBU"
   _arrayKey: "XvotpN"
-- body:
-    time: 1790907822269
-    version: "2.28.2"
+- id: "next-steps"
+  title: "Next steps"
+  body:
     blocks:
-      - data:
+      - type: "unorderedList"
+        data:
+          style: "unordered"
           items:
             - content: "<a href=\"/docs/project-structure/\">Project structure</a>: where routes, components and content models live."
               items: []
             - content: "<a href=\"/docs/routes/\">Routes</a>: file-based routing, data fetching and SSR."
               items: []
-            - items: []
-              content: "<a href=\"/docs/deployment/\">Deployment</a>: ship your site as static HTML or with a server."
-            - items: []
-              content: "<a href=\"/docs/cms/schemas/\">Schemas</a>: model your content."
+            - content: "<a href=\"/docs/deployment/\">Deployment</a>: ship your site as static HTML or with a server."
+              items: []
+            - content: "<a href=\"/docs/cms/schemas/\">Schemas</a>: model your content."
+              items: []
             - content: "<a href=\"/docs/cli/\">CLI reference</a> and <a href=\"/docs/api/\">API reference</a>."
               items: []
-          style: "unordered"
-        type: "unorderedList"
-  id: "next-steps"
+    time: 1790907822269
+    version: "2.28.2"
   blocks: []
-  title: "Next steps"
   _arrayKey: "PtsJwr"
```
