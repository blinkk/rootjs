# Update the developer docs: cms

- **id:** `2026-10-22-root-ai-define-skill`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-23T04:53:26.282Z

## Summary

- Docs/cms: Adds a section on custom Root AI tools and skills.

## Edit `Docs/cms`

Adds a section on custom Root AI tools and skills.

### Set `content.sections`

```diff yaml
 - id: "plugin-options"
   title: "Plugin options"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Only <code>firebaseConfig</code> is required. Common options include:"
       - type: "unorderedList"
         data:
           style: "unordered"
           items:
             - content: "<code>id</code>: namespaces the site's content in Firestore, so several sites can share one Firebase project. Defaults to <code>default</code>."
               items: []
             - content: "<code>name</code>: the site name shown in the CMS."
               items: []
             - content: "<code>firebaseConfig</code>: the web app config from the Firebase console."
               items: []
             - content: "<code>gapi</code>: a Google API key and OAuth client id, for the Google Drive and Sheets features."
               items: []
             - content: "<code>ai</code>: the models available to Root AI."
               items: []
             - content: "<code>isUserAuthorized</code>: a custom check for whether a user can access the CMS."
               items: []
       - type: "paragraph"
         data:
           text: "<a href=\"/docs/cms/checks/\">Checks</a>, <a href=\"/docs/cms/notifications/\">Notifications and integrations</a> and <a href=\"/docs/cms/customization/\">Customizing the CMS</a> cover the rest, and <code>CMSPluginOptions</code> in the <a href=\"/docs/api/root-cms/#blinkk-root-cms-plugin-cmspluginoptions\">API reference</a> lists every option."
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         import {defineConfig} from '@blinkk/root';
         import {cmsPlugin} from '@blinkk/root-cms/plugin';

         export default defineConfig({
           plugins: [
             cmsPlugin({
               id: 'my-site',
               name: 'My Site',
               firebaseConfig: {
                 apiKey: '...',
                 authDomain: 'my-project.firebaseapp.com',
                 projectId: 'my-project',
                 storageBucket: 'my-project.appspot.com',
               },
             }),
           ],
         });
       _arrayKey: "NjshfA"
   _arrayKey: "J9uosD"
 - id: "manual-setup"
   title: "Setting up Firebase by hand"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "<code>root-cms setup</code> does all of this for you (see <a href=\"/docs/#set-up-cms\">Getting started</a>). To set up a project by hand instead:"
       - type: "orderedList"
         data:
           style: "ordered"
           items:
             - content: "Create a project in the <a href=\"https://console.firebase.google.com/\">Firebase console</a>, or add Firebase to an existing Google Cloud project."
               items: []
             - content: "Create a Firestore database in <b>Native mode</b>."
               items: []
             - content: "Under <b>Authentication</b>, enable the <b>Google</b> sign-in provider. If your site will serve on a custom domain, add it to the authorized domains."
               items: []
             - content: "Under <b>Project settings</b>, register a web app and copy its <code>firebaseConfig</code> values into <code>cmsPlugin()</code>:"
               items: []
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

         cmsPlugin({
           id: 'starter',
           name: 'Starter',
           // From Project settings > Your apps in the Firebase console.
           firebaseConfig: {
             apiKey: '...',
             authDomain: 'my-project.firebaseapp.com',
             projectId: 'my-project',
             storageBucket: 'my-project.appspot.com',
           },
         }),
       _arrayKey: "AqyHS8"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Before you deploy, also replace <code>sessionCookieSecret</code> with a long random value. The server reads and writes Firestore with <a href=\"https://cloud.google.com/docs/authentication/application-default-credentials\">application default credentials</a>; for local development, sign in with the gcloud CLI:"
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "WJ4OR1"
     - _type: "CodeBlock"
       language: "bash"
       code: |-
         gcloud auth login
         gcloud auth application-default login
       _arrayKey: "MEFrho"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Finally, apply the security rules and add yourself as an admin, as described <a href=\"#security-rules\">below</a>."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "FjtkIG"
   _arrayKey: "8Cjpz5"
 - id: "security-rules"
   title: "Security rules and roles"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Content access is controlled by Firestore security rules and a list of roles per site. The easiest way to set both up is with <code>init-firebase</code>, which applies the rules and makes you an ADMIN:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "bash"
       code: "pnpm exec root-cms init-firebase --admin=you@example.com"
       _arrayKey: "2P87YC"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "To apply the rules by hand, paste them into the <b>Rules</b> tab of the Firestore page in the Firebase console:"
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "dCFmou"
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         rules_version = '2';
         service cloud.firestore {
           match /databases/{database}/documents {
             match /{document=**} {
               allow read, write: if false;
             }

             match /Projects/{project} {
               allow write:
                 if isSignedIn() && userIsAdmin();
               allow read:
                 if isSignedIn() && userCanRead();

               match /{collection}/{document=**} {
                 allow write:
                   if isSignedIn() && userCanPublish();
                 allow read:
                   if isSignedIn() && userCanRead();
               }

               match /Collections/{collectionId}/Drafts/{document=**} {
                 allow write:
                   if isSignedIn() && userCanEdit();
               }

               function isSignedIn() {
                 return request.auth != null;
               }

               function getRoles() {
                 return get(/databases/$(database)/documents/Projects/$(project)).data.roles;
               }

               function userCanRead() {
                 let roles = getRoles();
                 let email = request.auth.token.email;
                 let domain = '*@' + email.split('@')[1];
                 return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR', 'VIEWER']);
               }

               function userCanPublish() {
                 let roles = getRoles();
                 let email = request.auth.token.email;
                 let domain = '*@' + email.split('@')[1];
                 return (roles[email] in ['ADMIN', 'EDITOR']) || (roles[domain] in ['ADMIN', 'EDITOR']);
               }

               function userCanEdit() {
                 let roles = getRoles();
                 let email = request.auth.token.email;
                 let domain = '*@' + email.split('@')[1];
                 return (roles[email] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']) || (roles[domain] in ['ADMIN', 'EDITOR', 'CONTRIBUTOR']);
               }

               function userIsAdmin() {
                 let roles = getRoles();
                 let email = request.auth.token.email;
                 let domain = '*@' + email.split('@')[1];
                 return (roles[email] == 'ADMIN') || (roles[domain] == 'ADMIN');
               }
             }
           }
         }
       _arrayKey: "dME5Ea"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Then, in Firestore, create a doc at <code>Projects/&lt;id&gt;</code> (where <code>&lt;id&gt;</code> is the plugin's <code>id</code>) with a <code>roles</code> map from your email to <code>ADMIN</code>. After that, manage users from the CMS's settings page."
           - type: "paragraph"
             data:
               text: "The roles are:"
           - type: "unorderedList"
             data:
               style: "unordered"
               items:
                 - content: "<b>ADMIN</b>: everything, including managing users and settings."
                   items: []
                 - content: "<b>EDITOR</b>: edit and publish content."
                   items: []
                 - content: "<b>CONTRIBUTOR</b>: edit drafts, but not publish."
                   items: []
                 - content: "<b>VIEWER</b>: read-only access."
                   items: []
           - type: "paragraph"
             data:
               text: "A role can be granted to a whole domain with an entry like <code>*@example.com</code>. Anyone with a verified email on that domain gets the role, so use it sparingly, never with a free email provider, and prefer per-email grants for ADMIN and EDITOR."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "dX17ww"
   _arrayKey: "dYiquU"
 - id: "google-apis"
   title: "Google Drive and Sheets"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Some CMS features, like importing from Google Sheets and Drive, use Google APIs on the editor's behalf. To enable them:"
       - type: "orderedList"
         data:
           style: "ordered"
           items:
             - content: "In the Google Cloud console, enable the Google Sheets API and Google Drive API."
               items: []
             - content: "Create an <a href=\"https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow\">OAuth client id</a> (web application) and an API key."
               items: []
             - content: "Pass them to the plugin as <code>gapi: {clientId, apiKey}</code>, e.g. from environment variables."
               items: []
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "tDcWKP"
 - id: "ai"
   title: "Root AI"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Root AI lets editors chat with, draft and translate content in the CMS. Enable it with the <code>ai</code> option, listing the models editors can choose from and their API keys. See the <a href=\"/docs/migration/v3/#ai\">v3 migration guide</a> for an example."
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "zvlRFs"
 - id: "ai-tools"
   title: "Custom AI tools and skills"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "Root AI can call your own tools alongside the built-in ones for reading and editing docs. Add them to <code>ai.tools</code>. The chat runs in the browser, but a tool's <code>execute</code> function always runs on the server, so it can use API keys and server-only code. The input is checked against <code>inputSchema</code> (a zod schema, or <code>jsonSchema()</code> from <code>ai</code>) before <code>execute</code> runs, and whatever it returns is sent back to the model."
+      - type: "paragraph"
+        data:
+          text: "Skills are reusable instructions an editor runs by typing <code>/</code> and the skill's name in the chat box, like <code>/launch-checklist Pages/home</code>. The model gets the skill's <code>instructions</code> plus whatever was typed after the name."
+    time: 1792731108885
+    version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/root.config.ts

-        import {cmsPlugin, defineAiTool} from '@blinkk/root-cms/plugin';
+        import {cmsPlugin, defineAiSkill, defineAiTool} from '@blinkk/root-cms/plugin';
         import {z} from 'zod';

         cmsPlugin({
           ai: {
             models: [
               // ...
             ],
             tools: [
               defineAiTool({
                 name: 'inventory_lookup',
                 description: 'Looks up the stock level for a product SKU.',
                 inputSchema: z.object({sku: z.string()}),
                 execute: async ({sku}, ctx) => {
                   return await fetchStock(sku, {user: ctx.user.email});
                 },
               }),
             ],
             skills: [
-              {
+              defineAiSkill({
                 name: 'launch-checklist',
                 description: 'Reviews a page against the launch checklist.',
                 instructions: 'Read the page with doc_get, then check that ...',
-              },
+              }),
             ],
           },
         });
       _arrayKey: "TRaaf6"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "Set <code>write: true</code> on a tool that changes anything. Write tools aren't offered in the chat's read-only mode, and they always wait for the editor to approve each call, even in auto-apply mode. By default, read tools are available to every role and write tools to admins, editors and contributors; set <code>roles</code> to restrict a tool further. Tool names can't reuse the name of a built-in tool such as <code>doc_get</code>."
           - type: "paragraph"
             data:
               text: "Other plugins can contribute tools and skills too, by setting <code>rootAi: {tools, skills}</code> on the plugin object (see <code>RootAiPlugin</code> in the <a href=\"/docs/api/root-cms/#blinkk-root-cms-plugin-rootaiplugin\">API reference</a>)."
         time: 1792730871923
         version: "2.28.2"
       _arrayKey: "6fOZ7g"
-  body:
-    time: 1792731108885
-    blocks:
-      - type: "paragraph"
-        data:
-          text: "<i>Available as of version 2.4.1.</i>"
-      - type: "paragraph"
-        data:
-          text: "Root AI can call your own tools alongside the built-in ones for reading and editing docs. Add them to <code>ai.tools</code>. The chat runs in the browser, but a tool&#039;s <code>execute</code> function always runs on the server, so it can use API keys and server-only code. The input is checked against <code>inputSchema</code> (a zod schema, or <code>jsonSchema()</code> from <code>ai</code>) before <code>execute</code> runs, and whatever it returns is sent back to the model."
-      - type: "paragraph"
-        data:
-          text: "Skills are reusable instructions an editor runs by typing <code>/</code> and the skill&#039;s name in the chat box, like <code>/launch-checklist Pages/home</code>. The model gets the skill&#039;s <code>instructions</code> plus whatever was typed after the name."
-    version: "lexical-0.31.2"
   _arrayKey: "A5IijS"
 - id: "cron-jobs"
   title: "Scheduled jobs"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Scheduled publishing, version history and a few other features rely on a job that calls the <code>/cms/api/cron.run</code> endpoint every few minutes."
       - type: "paragraph"
         data:
           text: "<b>Firebase</b>: if your site is deployed to Cloud Functions for Firebase, export the <code>cron</code> function from <code>@blinkk/root-cms/functions</code>:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       language: "ts"
       code: |-
         // @/index.ts

         import {server} from '@blinkk/root/functions';
         import {cron} from '@blinkk/root-cms/functions';

         export const www = {
           server: server({mode: 'production'}),
           cron: cron(),
         };
       _arrayKey: "eWCWlv"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "<b>Other hosting</b>: on App Engine, Cloud Run or elsewhere, create a <a href=\"https://cloud.google.com/scheduler/docs/creating\">Cloud Scheduler</a> job that calls <code>/cms/api/cron.run</code> on your site every few minutes."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "un4Nfy"
   _arrayKey: "SpkDpc"
 - id: "credentials"
   title: "Credentials in production"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "The server accesses Firestore with application default credentials. On Google Cloud (App Engine, Cloud Run, Cloud Functions), the runtime's service account is used, so give it access to Firestore. Elsewhere, set <code>GOOGLE_APPLICATION_CREDENTIALS</code> to a service account key file."
     time: 1792454989530
     version: "2.28.2"
   blocks: []
   _arrayKey: "vMCdA0"
```
