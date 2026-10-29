# Update the developer docs: index, cms--customization

- **id:** `2026-10-29-cms-theme-skill`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-29T23:11:57.192Z

## Summary

- Docs/index: Lists theming the CMS among the things an agent can do with the installed skills.
- Docs/cms--customization: Adds a prompt for the root-cms-theme agent skill to the branding and themes section.

## Edit `Docs/index`

Lists theming the CMS among the things an agent can do with the installed skills.

### Set `content.sections`

```diff yaml
 - id: "overview"
   title: "Overview"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Root.js is a web platform for building content-driven websites. It pairs a TypeScript web framework with a built-in CMS, so developers, writers and translators can work on the same site."
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<b>The framework</b> renders TSX on the server, either on demand (SSR) or ahead of time as static HTML (SSG). It's built on <a href=\"https://vite.dev/\">Vite</a>, and it ships no client-side JavaScript unless you add it."
               items: []
             - content: "<b>The CMS</b> adds visual editing with live preview, localization, releases and publishing workflows. Content is stored in your own <a href=\"https://firebase.google.com/\">Firebase</a> project, and content models are defined in code."
               items: []
     time: 1790907822269
     version: "2.28.2"
   blocks: []
   _arrayKey: "5bc0bu"
 - id: "requirements"
   title: "Requirements"
   body:
     blocks:
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<a href=\"https://nodejs.org/\">Node.js</a> 24 (the current LTS) or later."
               items: []
             - content: "A package manager. We recommend <a href=\"https://pnpm.io/\">pnpm</a>, which you can enable with Corepack."
               items: []
             - content: "For the CMS: the <a href=\"https://cloud.google.com/sdk/docs/install\">gcloud CLI</a> and a Google Cloud billing account. The CMS needs Secret Manager and a storage bucket, which require billing, but low-traffic sites usually stay in the free tier."
               items: []
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         node --version  # v24 or later
         corepack enable
       _arrayKey: "mLs31W"
   _arrayKey: "240Poj"
 - id: "ai-setup"
   title: "Set up with an AI agent"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "The quickest way to a working site is to let a coding agent (such as <a href=\"https://claude.com/claude-code\">Claude Code</a>) run the steps on this page for you. Start it in the folder where you keep your projects and paste this prompt:"
     time: 1790910943919
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       code: |-
         Set up a new Root.js site. Follow the instructions at
         https://rootjs.dev/skills/root-cms-setup.md
       _arrayKey: "NTEkwZ"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The agent asks a few questions up front: the folder name, whether to use a new or existing Google Cloud project, and a site id. It then creates the project, runs <code>root-cms setup</code> (after showing you a dry run), starts the dev server and installs the Root.js skills, so later sessions know how to work with your content."
           - type: "paragraph"
             data:
               text: "A few steps need you, because they happen in a browser or pick who pays: signing in with <code>gcloud</code>, choosing a billing account for a new project, and turning on Google sign-in in the Firebase console. The agent tells you when."
           - type: "paragraph"
             data:
               text: "If you'd rather do it yourself, the rest of this page covers the same steps."
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "IbVRzp"
   _arrayKey: "h4spqt"
 - id: "existing-project"
   title: "Set up an existing project"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "If you're joining a team whose site is already set up, you don't need <code>root-cms setup</code>. Clone the repo, open an agent in it, and paste this prompt:"
     time: 1792904944718
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       code: |-
         Set up this Root.js project on my machine. Follow the instructions at
         https://rootjs.dev/skills/root-dev-setup.md
       _arrayKey: "Q882Pg"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The agent checks Node.js, pnpm and <code>gcloud</code>, asks you to sign in to Google Cloud, installs the dependencies, downloads the team's shared secrets into <code>.env</code>, checks that you can reach the CMS and starts the dev server. It doesn't change the project's Google Cloud setup; if you're missing access, it tells you what to ask for."
           - type: "paragraph"
             data:
               text: "To do it yourself:"
         time: 1792904944718
         version: "2.28.2"
       _arrayKey: "P7GBEk"
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         pnpm install

         # Sign in with the account your team added to the project. Both open a browser.
         gcloud auth login
         gcloud auth application-default login

         # Downloads the shared secrets into .env, then starts the server.
         pnpm dev
       _arrayKey: "xmoKPP"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "To use the CMS, you need access to the site's Google Cloud project (for Firestore and Secret Manager) and a role in the CMS, which an admin adds under <b>Settings</b>. If Firestore returns <code>PERMISSION_DENIED</code> locally, run <code>gcloud auth application-default set-quota-project &lt;project-id&gt;</code>."
         time: 1792904944718
         version: "2.28.2"
       _arrayKey: "doS3Za"
   _arrayKey: "3CAuEO"
 - id: "create-project"
   title: "Create a project"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Scaffold a new project from the <a href=\"https://github.com/blinkk/rootjs/tree/main/examples/starter\">starter</a> template:"
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm create @blinkk/root my-site"
       _arrayKey: "JkiEcA"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "It offers to install the dependencies and set up Google Cloud for the CMS right away. Say yes to run the setup wizard described <a href=\"#set-up-cms\">below</a>, or say no and run it later. Either way, start the dev server from the new folder:"
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "FGHNae"
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         cd my-site
         pnpm install
         pnpm dev
       _arrayKey: "bqbBRb"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The site runs at <a href=\"http://localhost:4007\">http://localhost:4007</a>, and pages reload as you edit them. To use a different port, set the <code>PORT</code> environment variable."
           - type: "paragraph"
             data:
               text: "The starter comes with the CMS, a <code>Pages</code> collection, and a route that builds each page from a list of templates:"
           - type: "html"
             data:
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
           - type: "paragraph"
             data:
               text: "Until the CMS is connected to Google Cloud, the home page shows the setup steps."
           - type: "paragraph"
             data:
               text: "<b>Just the framework?</b> The <a href=\"https://github.com/blinkk/rootjs/tree/main/examples/minimal\">minimal</a> template is a plain Root.js project with a single \"Hello, Root.js\" page at <code>routes/index.tsx</code>, and no CMS. It's a good fit for static sites. To add the CMS to it later, install <code>@blinkk/root-cms</code> and <code>firebase-admin</code>, and add <code>cmsPlugin()</code> as described in <a href=\"/docs/cms/\">CMS configuration</a>:"
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "FIDu3g"
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm create @blinkk/root --template=minimal my-site"
       _arrayKey: "E0Ccab"
   _arrayKey: "TUHmOV"
 - id: "set-up-cms"
   title: "Connect the CMS to Google Cloud"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "The CMS runs inside your site at <code>/cms/</code> and stores content in Firestore, in a Google Cloud project you own. The <code>root-cms setup</code> wizard sets up that project. If you said yes in <code>create-root</code>, it has already run; otherwise run it from your project:"
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm exec root-cms setup"
       _arrayKey: "znWhJ5"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "It asks for a new or existing project and a site id, then:"
           - type: "unorderedList"
             data:
               style: "unordered"
               items:
                 - content: "Signs you in with <code>gcloud</code>, if needed, and links a billing account."
                   items: []
                 - content: "Adds Firebase, creates the Firestore database and storage bucket, and applies the CMS's security rules."
                   items: []
                 - content: "Makes you an ADMIN of the CMS."
                   items: []
                 - content: "Creates a service account for the site to run as in production."
                   items: []
                 - content: "Stores a session secret in Secret Manager, and creates a <code>.root.secrets.json</code> manifest to commit (see <a href=\"#secrets\">Share environment variables</a>)."
                   items: []
                 - content: "Writes the site id and Firebase config into <code>root.config.ts</code>."
                   items: []
           - type: "paragraph"
             data:
               text: "One step is manual, because Google has no API for it: the wizard asks you to turn on Google sign-in in the Firebase console, links you to the page, and checks that it worked."
           - type: "paragraph"
             data:
               text: "The site id keeps this site's content, uploads and secrets apart, so several sites can share one Google Cloud project. The wizard is safe to run again: it skips anything that's already set up, so if a step fails, fix it and re-run. Pass <code>--dry-run</code> to see what it would change first."
           - type: "paragraph"
             data:
               text: "<b>Create your home page</b>"
           - type: "paragraph"
             data:
               text: "Restart the dev server and open <a href=\"http://localhost:4007/cms/\">http://localhost:4007/cms/</a>. In the <code>Pages</code> collection, create a doc with the slug <code>index</code>, add a <b>TemplateHero</b> module, and publish it. It replaces the setup page at <code>/</code>. Other slugs map to their own URL, e.g. <code>about</code> renders at <code>/about</code>."
           - type: "paragraph"
             data:
               text: "To set up Firebase without the wizard, or to see every option the CMS supports, see <a href=\"/docs/cms/\">CMS configuration</a>."
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "BrgBPT"
   _arrayKey: "1foRiF"
 - id: "templates"
   title: "Build pages from templates"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Each page in the starter is a list of modules. The <code>Pages</code> collection offers every template schema in the <code>templates/</code> folder with <code>schema.glob()</code>:"
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/collections/Pages.schema.ts

         schema.array({
           id: 'modules',
           label: 'Modules',
           of: schema.oneOf({
             // Every `templates/<Name>/<Name>.schema.ts` file is available here.
             types: schema.glob('/templates/*/*.schema.ts'),
           }),
         }),
       _arrayKey: "R1MOHI"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The route at <code>routes/[[...slug]].tsx</code> loads the doc for the URL with <code>RootCMSClient</code>, and <code>PageModules</code> renders each module with the component that matches its template name. Editors can preview drafts by adding <code>?preview=true</code> to the URL."
           - type: "paragraph"
             data:
               text: "To add a template, create a folder in <code>templates/</code> with a schema and a component of the same name. For example, here's the starter's <code>TemplateHero</code> template:"
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "KBzijp"
     - _type: "CodeBlock"
       language: "ts"
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
       _arrayKey: "FGDu9r"
     - _type: "CodeBlock"
       language: "tsx"
       code: |-
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
       _arrayKey: "rZ8TNH"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Then regenerate the TypeScript types for your schemas. The new template shows up in the CMS the next time you open it:"
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "Q3UOGL"
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm exec root-cms generate-types"
       _arrayKey: "oEEpHe"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Learn more in <a href=\"/docs/cms/schemas/\">Schemas</a> and <a href=\"/docs/cms/data-fetching/\">Data fetching</a>."
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "zpXbee"
   _arrayKey: "jYv124"
 - id: "secrets"
   title: "Share environment variables"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "API keys and other secrets belong in a <code>.env</code> file, which shouldn't be committed. To share them with your team, <code>root secrets</code> stores them in <a href=\"https://cloud.google.com/secret-manager\">Google Cloud Secret Manager</a> and keeps each developer's <code>.env</code> in sync. <code>root-cms setup</code> creates the <code>.root.secrets.json</code> manifest for you; for a project without the CMS, create it with <code>root secrets init</code>:"
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         # Create a manifest (.root.secrets.json) and commit it.
         pnpm exec root secrets init --gcp-project=my-project --gsm-key=my-site-env

         # Upload the values in your .env file.
         pnpm exec root secrets push

         # Teammates download them into their own .env.
         pnpm exec root secrets sync
       _arrayKey: "s8u0nz"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Once a project has a manifest, <code>root dev</code> syncs the secrets when it starts. See the <a href=\"/docs/cli/#root-secrets\">CLI reference</a> for every command."
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "0wyg3V"
   _arrayKey: "A9WBm4"
 - id: "ai-agents"
   title: "Work with AI agents"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Root.js includes skills that teach AI coding agents, such as Claude Code, how to set up the CMS and how to read and edit your content from the command line. If an agent set up your project, they're already installed. Otherwise, install them into your project and commit them:"
     time: 1790907822269
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm exec root-cms skill.install"
       _arrayKey: "xCHfql"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "With the skills installed, you can ask an agent to:"
           - type: "unorderedList"
             data:
               style: "unordered"
               items:
                 - content: "Look up or update content, e.g. \"list the pages that don't have a meta description\"."
                   items: []
                 - content: "Propose content changes as a YAML file that your team reviews in a pull request, then applies with <code>root-cms proposal.apply</code>."
                   items: []
+                - content: "Theme the CMS to match your brand (see <a href=\"/docs/cms/customization/#branding\">Branding and themes</a>)."
+                  items: []
                 - content: "Set up a fresh clone of the project on a teammate's machine: tools, <code>gcloud</code> sign-in, shared secrets and CMS access (see <a href=\"#existing-project\">Set up an existing project</a>)."
                   items: []
           - type: "paragraph"
             data:
               text: "The skills install to an existing agent skills folder, such as <code>.claude/skills</code>, or to <code>.agent/skills</code> if there isn't one. Re-run the command with <code>--force</code> after upgrading <code>@blinkk/root-cms</code> to pick up new versions."
         time: 1790907822269
         version: "2.28.2"
       _arrayKey: "yxZT81"
   _arrayKey: "rvvEsR"
 - id: "next-steps"
   title: "Next steps"
   body:
     blocks:
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<a href=\"/docs/project-structure/\">Project structure</a>: where routes, components and content models live."
               items: []
             - content: "<a href=\"/docs/routes/\">Routes</a>: file-based routing, data fetching and SSR."
               items: []
             - content: "<a href=\"/docs/deployment/\">Deployment</a>: ship your site as static HTML or with a server."
               items: []
             - content: "<a href=\"/docs/cms/schemas/\">Schemas</a>: model your content."
               items: []
             - content: "<a href=\"/docs/cli/\">CLI reference</a> and <a href=\"/docs/api/\">API reference</a>."
               items: []
     time: 1790907822269
     version: "2.28.2"
   blocks: []
   _arrayKey: "cmZGFm"
```

## Edit `Docs/cms--customization`

Adds a prompt for the root-cms-theme agent skill to the branding and themes section.

### Set `content.sections`

```diff yaml
 - id: "sidebar"
   title: "Sidebar tools"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>sidebar.tools</code> adds your own entries to the CMS sidebar, e.g. an internal dashboard or a link to a style guide. A tool with an <code>iframeUrl</code> renders that page inside the CMS at <code>/cms/tools/&lt;id&gt;</code>. <code>cmsUrl</code> links to a CMS page instead, and <code>externalUrl</code> opens a new tab:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           sidebar: {
             tools: {
               launches: {
                 label: 'Launch calendar',
                 icon: 'data:image/svg+xml;base64,...',
                 iframeUrl: '/internal/launches/',
               },
               styleguide: {
                 label: 'Style guide',
                 externalUrl: 'https://example.com/styleguide',
               },
             },
             hiddenBuiltInTools: ['data', 'releases'],
           },
         }),
       _arrayKey: "qp9Mz2"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The iframe's path, query and hash are mirrored into the CMS URL, so a tool's pages survive a refresh and can be shared. For icons that match the CMS, pick one from <a href=\"https://tabler.io/icons\">Tabler Icons</a> with a stroke width of 1.5 and paste its data URI."
           - type: "paragraph"
             data:
               text: "<code>hiddenBuiltInTools</code> hides built-in tools from the sidebar and the home page: <code>home</code>, <code>content</code>, <code>releases</code>, <code>data</code>, <code>assets</code>, <code>translations</code>, <code>ai</code> and <code>settings</code>. Their pages still work by URL. The task manager can be turned off with <code>experiments: {taskManager: false}</code>."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "CHZo1f"
   _arrayKey: "HWGMnd"
 - id: "branding"
   title: "Branding and themes"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>name</code> is shown in the CMS header and <code>favicon</code> replaces the browser tab icon. <code>minimalBranding: true</code> hides the Root.js logo and shows the project name instead."
       - type: "paragraph"
         data:
           text: "Themes restyle the CMS. They're experimental. A theme is a stylesheet loaded after the CMS's own, from a <code>file</code> relative to the project root or a <code>css</code> string:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           themes: [{id: 'brand', name: 'Brand', file: './cms/brand.css'}],
           defaultTheme: 'brand',
         }),
       _arrayKey: "GTcVUG"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Each user picks a theme under <b>Settings → Theme</b>, and <code>defaultTheme</code> applies until they do. The same page lets admins add CSS for the whole project, and anyone add CSS for themselves, without a deploy."
           - type: "paragraph"
             data:
               text: "To write a theme, copy <code>packages/root-cms/ui/styles/theme.css</code> from the Root.js repo and change its values. Its <code>--cms-*</code> custom properties are kept stable across releases. Rules that target the CMS's class names work, but may break with any release."
+          - type: "paragraph"
+            data:
+              text: "Or have a coding agent write one from your brand's colors, a logo or a link to your site. Paste this prompt in your project:"
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "20lGh0"
+    - _type: "CodeBlock"
+      code: |-
+        Make a CMS theme that matches our brand. Follow the instructions at
+        https://rootjs.dev/skills/root-cms-theme.md
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "The agent asks how the theme should look and whether it should be a shared theme or CSS to paste under <b>Settings → Theme</b>. It sets only <code>--cms-*</code> properties, checks the text contrast in light and dark mode, and then registers the theme in <code>themes</code> or gives you the CSS. <code>root-cms skill.install</code> also installs the skill, as <code>root-cms-theme</code>."
+        time: 1793315516414
+        version: "2.28.2"
   _arrayKey: "8YJ2ZO"
 - id: "access"
   title: "Access control"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Users sign in with Google, and what they can do comes from their role (see <a href=\"/docs/cms/#security-rules\">Security rules and roles</a>). Sign-in is always required for <code>/cms/</code> pages and for any page with <code>?preview=true</code>, which is how the editor's preview loads draft content."
       - type: "paragraph"
         data:
           text: "<code>isLoginRequired(req)</code> requires sign-in for more of your site, e.g. a staging server or an internal section. <code>isUserAuthorized(req, user)</code> adds your own rule for who can sign in at all:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           isLoginRequired: (req) => req.path.startsWith('/internal/'),
           isUserAuthorized: (req, user) => user.email.endsWith('@example.com'),
         }),
       _arrayKey: "ynmvhx"
   _arrayKey: "pB3vR3"
 - id: "embedding"
   title: "Embedding the editor"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>@blinkk/root-cms/browser-client</code> opens the CMS editor or Root AI from another site, e.g. an \"Edit this page\" button on a staging site. The CMS can't be framed by default, so list the embedding site in <code>allowedIframeOrigins</code>:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           allowedIframeOrigins: ['https://staging.example.com'],
         }),
       _arrayKey: "Qhm1GE"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // On https://staging.example.com

         import {RootCMSBrowserClient} from '@blinkk/root-cms/browser-client';

         const cms = new RootCMSBrowserClient({cmsOrigin: 'https://example.com'});

         button.addEventListener('click', () => {
           const editor = cms.openEditor('Pages/about', {deeplink: 'hero.title'});
           editor.on('published', () => location.reload());
         });
       _arrayKey: "h0DTe8"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "<code>openEditor()</code> opens a pop-up by default; pass <code>{mode: 'iframe', container}</code> to render it in the page instead. The editor emits <code>ready</code>, <code>saved</code>, <code>published</code>, <code>error</code> and <code>close</code> events, and doesn't autosave. <code>openRootAI({docId})</code> opens Root AI with a doc as context."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "Y2ReAe"
   _arrayKey: "QUKHPS"
 - id: "preview"
   title: "Live preview messages"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Your pages can talk to the editor while they're shown in its preview pane. With <code>RootCMSBrowserClient.connectPreview()</code>, a page can scroll the editor to a field (for \"click to edit\"), highlight the field being edited, and switch the editor to another doc as the user navigates. Turn on the messages with <code>preview.channel</code>: <code>true</code> for both directions, or <code>'to-preview'</code> or <code>'from-preview'</code> for one."
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           preview: {channel: true},
         }),
       _arrayKey: "i72Quv"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // In your page's client-side code.

         import {RootCMSBrowserClient} from '@blinkk/root-cms/browser-client';

         const preview = RootCMSBrowserClient.connectPreview();
         if (preview.isEmbedded) {
           // Keep the editor on the doc for the page being previewed.
           preview.navigateToDoc('Pages/about');
           // Outline the element for the field being edited.
           preview.on('highlight', ({deepKey, scroll}) => {
             // ...
           });
           // Click an element to edit its field.
           heroTitle.addEventListener('click', () => preview.focusField('hero.title'));
         }
       _arrayKey: "eOXkXv"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Outside the preview pane, <code>isEmbedded</code> is false and the calls do nothing, so the code is safe to ship. <code>navigateToDoc()</code> asks the editor to confirm before switching docs; pass <code>{confirm: false}</code> to switch straight away."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "Y43pQ4"
   _arrayKey: "UL9YnP"
 - id: "images"
   title: "Image serving"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "By default, uploaded images are served straight from Cloud Storage. With <code>gci: true</code>, uploaded images are served from a Google image-serving URL instead, which can resize and convert them on the fly. It uses the hosted service at <code>services.rootjs.dev</code>; set <code>gci</code> to a URL to use your own. The storage bucket needs fine-grained permissions, and the service's account (listed at <code>https://services.rootjs.dev/_/service_account</code>) needs owner access to it."
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "4Vo3Jc"
 - id: "search-and-dependencies"
   title: "Search and the dependency graph"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "The CMS's global search indexes every doc, and the index is kept up to date by the <a href=\"/docs/cms/#cron-jobs\">scheduled job</a>. <code>searchIndex</code> limits what's indexed, with <code>includeCollections</code>, <code>excludeCollections</code>, <code>includeDocIds</code> and <code>excludeDocIds</code> (doc ids look like <code>Pages/about</code>)."
       - type: "paragraph"
         data:
           text: "The dependency graph tracks which docs reference which, through <code>schema.reference()</code> and <code>schema.references()</code> fields. It's on by default and also kept up to date by the scheduled job. Use it to fetch everything a page needs in one batch request:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         const depIds = await cmsClient.getDocDependencies(['Pages/index'], {
           mode: 'published',
         });
         const req = cmsClient.createBatchRequest({mode: 'published'});
         req.addDoc('Pages/index');
         depIds.forEach((docId) => req.addDoc(docId));
         const res = await req.fetch();
       _arrayKey: "WZhWRz"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Dependencies are followed transitively unless you pass <code>transitive: false</code>. <code>dependencyGraph: false</code> turns the graph off, and <code>{includeCollections, excludeCollections}</code> limits which collections are scanned for references."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "Jk835T"
   _arrayKey: "Y4FRNZ"
 - id: "other-options"
   title: "Other options"
   body:
     blocks:
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<code>defaultOneOfVariant</code>: <code>'dropdown'</code> (the default) or <code>'picker'</code>, the default UI for <code>oneOf</code> fields. A field's own <code>variant</code> overrides it."
               items: []
             - content: "<code>logLevel</code>: how much the CMS logs to the console, from <code>'debug'</code> to <code>'silent'</code>. Defaults to <code>'info'</code>."
               items: []
             - content: "<code>watch</code>: set to <code>false</code> to stop the dev server from watching schema files and regenerating <code>root-cms.d.ts</code>."
               items: []
             - content: "<code>firebaseConfig.databaseId</code>: use a named Firestore database instead of the default one."
               items: []
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "nVjEYZ"
```
