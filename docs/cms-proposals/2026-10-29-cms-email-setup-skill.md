# Update the developer docs: index, cms--notifications

- **id:** `2026-10-29-cms-email-setup-skill`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-29T23:13:26.003Z

## Summary

- Docs/index: Lists setting up email notifications among the things an agent can do with the installed skills.
- Docs/cms--notifications: Adds the Mail API limits, the scheduled job, and a prompt for the root-cms-email-setup agent skill to the email delivery section.

## Edit `Docs/index`

Lists setting up email notifications among the things an agent can do with the installed skills.

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
                 - content: "Set up a fresh clone of the project on a teammate's machine: tools, <code>gcloud</code> sign-in, shared secrets and CMS access (see <a href=\"#existing-project\">Set up an existing project</a>)."
                   items: []
+                - content: "Set up email notifications, including the email service they're sent with (see <a href=\"/docs/cms/notifications/#email-delivery\">Delivering email</a>)."
+                  items: []
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

## Edit `Docs/cms--notifications`

Adds the Mail API limits, the scheduled job, and a prompt for the root-cms-email-setup agent skill to the email delivery section.

### Set `content.sections`

```diff yaml
 - id: "actions"
   title: "Actions"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Each action has a name like <code>doc.publish</code>, <code>doc.save</code>, <code>release.publish</code> or <code>doc.comment.add</code>, the email of the user who performed it (<code>by</code>, or <code>system</code> for scheduled jobs), a <code>timestamp</code> and <code>metadata</code> such as the <code>docId</code>. Actions are stored at <code>Projects/&lt;id&gt;/ActionLogs</code> in Firestore and listed in the CMS's action log."
       - type: "paragraph"
         data:
           text: "The <code>onAction</code> option is called on the server with every action. It isn't awaited, so use it for quick, fire-and-forget work:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           onAction: (action) => {
             if (action.action === 'doc.publish') {
               console.log(`${action.by} published ${action.metadata?.docId}`);
             }
           },
         }),
       _arrayKey: "YgJcjK"
   _arrayKey: "mfuQJ7"
 - id: "notification-services"
   title: "Notification services"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "For notifications, register services with the <code>notifications</code> option. Each service has an <code>id</code>, a <code>label</code> and an async <code>onAction(ctx, action)</code> handler, and each one decides for itself which actions to handle. <code>ctx</code> has the <code>rootConfig</code>, a <code>cmsClient</code> and the <code>user</code> who performed the action. For example, to post to a Slack webhook:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           notifications: [
             {
               id: 'slack',
               label: 'Slack',
               onAction: async (ctx, action) => {
                 if (action.action !== 'doc.publish') {
                   return;
                 }
                 await fetch(process.env.SLACK_WEBHOOK_URL!, {
                   method: 'POST',
                   headers: {'Content-Type': 'application/json'},
                   body: JSON.stringify({
                     text: `${action.by} published ${action.metadata?.docId}`,
                   }),
                 });
                 return {status: 'success'};
               },
             },
           ],
         }),
       _arrayKey: "XdcnIk"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "A handler can return <code>{status: 'success' | 'info' | 'error', message}</code> to describe what it did. Errors are logged and don't affect the action or the other services."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "veMo0N"
   _arrayKey: "NXRw1D"
 - id: "email-notifications"
   title: "Email notifications"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>emailNotifications()</code> is a built-in service that emails a list of people when matching actions happen. <code>actions</code> takes patterns where <code>*</code> matches anything, and <code>to</code> can be a list or a function that returns the recipients for an action:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         import {
           cmsPlugin,
           commentEmailNotifications,
           emailNotifications,
         } from '@blinkk/root-cms/plugin';

         cmsPlugin({
           // ...
           notifications: [
             emailNotifications({
               actions: ['doc.publish', 'release.*'],
               to: ['web-team@example.com'],
               template: {
                 subject: '[My Site] {action} by {by}',
                 body: '{by} ran {action} on {metadata.docId}.',
               },
               emailService: 'https://my-email-service.appspot.com',
             }),
             commentEmailNotifications({
               emailService: 'https://my-email-service.appspot.com',
             }),
           ],
         }),
       _arrayKey: "G2IKEn"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Templates fill <code>{placeholder}</code> values from the action, including nested ones like <code>{metadata.docId}</code>, and can set <code>subject</code>, a plain-text <code>body</code> and <code>html</code>. Without a template, a default email describes the action. For full control, pass a function that returns the email. <code>filter</code> can skip actions (e.g. ones by a bot account), and <code>transformData</code> changes the data the template sees."
           - type: "paragraph"
             data:
               text: "<code>commentEmailNotifications()</code> emails the people <code>@mentioned</code> in a field comment and everyone who has already commented in the thread, when a comment is added, resolved or reopened. Links in the email point to <code>rootConfig.domain</code> unless you set <code>cmsUrl</code>."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "yGXBdx"
   _arrayKey: "iZsan5"
 - id: "email-delivery"
   title: "Delivering email"
   body:
     blocks:
       - type: "paragraph"
         data:
-          text: "Emails are queued in Firestore at <code>Projects/&lt;id&gt;/Emails</code> and sent by the Root.js email service, a small App Engine app (<code>apps/root-services</code> in the Root.js repo) that reads the queue and sends with the App Engine Mail API. Deploy it to App Engine in the Google Cloud project that has your Firestore database, and set <code>emailService</code> to its URL so new emails are sent right away."
+          text: "Emails are queued in Firestore at <code>Projects/&lt;id&gt;/Emails</code> and sent by the Root.js email service, a small App Engine app (<code>apps/root-services</code> in the Root.js repo) that reads the queue and sends with the App Engine Mail API. It only reads the queue of the Google Cloud project it runs in, so deploy it to the project that has your Firestore database. Set <code>emailService</code> to its URL so new emails are sent right away, and have a scheduled job call its <code>/_/send_emails?projectId=&lt;id&gt;</code> endpoint every few minutes to send anything that was missed."
       - type: "paragraph"
         data:
+          text: "The Mail API sends to at most 100 recipients a day, 8 a minute, and each recipient of an email counts. Emails over the limit are marked as failed and aren't retried, so send alerts to a Google Group address (which counts once) rather than to each person. For more volume, send through a provider like SendGrid with a <a href=\"#notification-services\">custom notification service</a>."
+      - type: "paragraph"
+        data:
           text: "Emails are sent from <code>noreply@&lt;project-id&gt;.appspotmail.com</code> by default. A different <code>from</code> address must be an authorized sender for the Mail API. Set <code>expireAfterMinutes</code> to skip emails that couldn't be sent in time instead of sending them late."
       - type: "paragraph"
         data:
           text: "Your own server code can send email through the same queue with <code>cmsClient.sendEmail({to, subject, body, htmlBody})</code>."
+      - type: "paragraph"
+        data:
+          text: "A coding agent can set all of this up for you. Paste this prompt in your project:"
     time: 1792454989530
     version: "2.28.2"
-  blocks: []
+  blocks:
+    - _type: "CodeBlock"
+      code: |-
+        Set up email notifications for our CMS. Follow the instructions at
+        https://rootjs.dev/skills/root-cms-email-setup.md
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "The agent asks who should get which emails, then deploys the email service to App Engine, creates the Firestore index and the scheduled job it needs, and adds ready-made emails for releases, publishes, publishing locks and comments to <code>cms/emails.ts</code>. It asks before creating or deploying anything, and ends by sending you a test email. <code>root-cms skill.install</code> also installs the skill, as <code>root-cms-email-setup</code>."
+        time: 1793315605104
+        version: "2.28.2"
   _arrayKey: "ISJEqJ"
 - id: "translation-services"
   title: "Translation services"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "To connect a translation platform like Crowdin or Smartling, register a service with the <code>translations</code> option. It appears in the <b>Import</b> and <b>Export</b> menus of a doc's localization modal. <code>onExport</code> receives the doc's strings and their current translations, and <code>onImport</code> returns translated rows to merge into the CMS:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           // ...
           translations: [
             {
               id: 'my-tms',
               label: 'My TMS',
               onExport: async (ctx, rows) => {
                 // rows: [{source, translations: {de: '...', fr: '...'}}, ...]
                 const job = await myTms.upload(ctx.docId, rows);
                 return {
                   status: 'success',
                   message: `Sent ${rows.length} strings.`,
                   link: {url: job.url, label: 'Open in My TMS'},
                 };
               },
               onImport: async (ctx) => {
                 return await myTms.download(ctx.docId, ctx.translationLanguages);
               },
             },
           ],
         }),
       _arrayKey: "MmQT7E"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "<code>ctx</code> has the doc's <code>docId</code>, the project's <code>locales</code> and its <code>translationLanguages</code> (the keys used in <code>translations</code>; see <code>i18n.translationLanguages</code> in <code>root.config.ts</code>). Either handler can return a <code>title</code>, <code>message</code>, <code>link</code> and <code>status</code> to show in a notification, and <code>onImport</code> can return one of these instead of rows when there's nothing to import."
           - type: "paragraph"
             data:
               text: "<code>excludeLocalesFromTranslations</code> leaves locales out of every import and export, including CSV and Google Sheets. It takes patterns like <code>['ALL_*']</code>, which is useful for pseudo-locales that are never translated."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "TFi0Rd"
   _arrayKey: "IWpOrw"
```
