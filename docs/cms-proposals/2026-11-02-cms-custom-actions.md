# Update the developer docs: cms--notifications, plugins

- **id:** `2026-11-02-cms-custom-actions`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-11-02T17:21:31.205Z

## Summary

- Docs/plugins: Links to the new section on logging custom actions.
- Docs/cms--notifications: Adds a section on logging custom actions from plugins, including the label option of logAction().

## Edit `Docs/plugins`

Links to the new section on logging custom actions.

### Set `content.body`

```diff yaml
 blocks:
   - type: "paragraph"
     data:
       text: "Plugins hook into the Root.js server and build. They're added to the <code>plugins</code> list in <code>root.config.ts</code>. The CMS itself is a plugin (<code>cmsPlugin()</code>), and you can write your own. For every hook, see <code>Plugin</code> in the <a href=\"/docs/api/root/#blinkk-root-plugin\">API reference</a>."
   - type: "paragraph"
     data:
-      text: "A plugin can also add pages, custom elements and CMS collections to a site by bundling them as a <a href=\"/docs/plugins/pods/\">pod</a>."
+      text: "A plugin can also add pages, custom elements and CMS collections to a site by bundling them as a <a href=\"/docs/plugins/pods/\">pod</a>, and record what it does in the CMS by logging <a href=\"/docs/cms/notifications/#custom-actions\">custom actions</a>."
 time: 1790660317218
 version: "2.28.2"
```

## Edit `Docs/cms--notifications`

Adds a section on logging custom actions from plugins, including the label option of logAction().

### Set `meta.description`

```diff text
-React to CMS actions with the onAction hook and notification services, send email, and connect a translation service.
+React to CMS actions with the onAction hook and notification services, log custom actions, send email, and connect a translation service.
```

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
       _arrayKey: "EtP1nk"
   _arrayKey: "9BAz0B"
+- id: "custom-actions"
+  title: "Custom actions"
+  body:
+    blocks:
+      - type: "paragraph"
+        data:
+          text: "Plugins and other server code can log their own actions with <code>logAction()</code> on <a href=\"/docs/api/root-cms/#blinkk-root-cms-client-rootcmsclient\"><code>RootCMSClient</code></a>. A custom action is stored like any other, so it shows up in the action log and on the CMS home page, and it reaches <code>onAction</code> and your notification services. Name it with a prefix of your own, like <code>inventory.sync</code>, so that it can't collide with the CMS's actions and services can match it with a pattern like <code>inventory.*</code>."
+      - type: "paragraph"
+        data:
+          text: "The home page shows recent actions as sentences: who did it, what they did, and what they did it to. Pass <code>label</code> to write the middle part for your action:"
+    time: 1793640090297
+    version: "2.28.2"
+  blocks:
+    - _type: "CodeBlock"
+      language: "ts"
+      code: |-
+        // @/plugins/inventory.ts
+
+        import type {RootConfig} from '@blinkk/root';
+        import {RootCMSClient} from '@blinkk/root-cms';
+
+        export async function logInventorySync(
+          rootConfig: RootConfig,
+          options: {userEmail: string; feedId: string; skuCount: number}
+        ) {
+          const {userEmail, feedId, skuCount} = options;
+          const cmsClient = new RootCMSClient(rootConfig);
+          await cmsClient.logAction('inventory.sync', {
+            by: userEmail,
+            label: 'synced inventory from',
+            metadata: {feedId, skuCount},
+            links: [
+              {label: 'View feed', url: `https://example.com/feeds/${feedId}`},
+            ],
+          });
+        }
+    - _type: "CopyBlock"
+      body:
+        blocks:
+          - type: "paragraph"
+            data:
+              text: "That row reads \"Ada Lin synced inventory from warehouse-feed\". The name comes from <code>by</code>, so write the label as a lowercase phrase that follows it, with no final period. The value at the end comes from the action's metadata: a key the CMS knows, like <code>docId</code>, or else the first key ending in <code>Id</code> alphabetically. If your metadata has no such key, the label stands alone, as in \"rebuilt the search index\"."
+          - type: "paragraph"
+            data:
+              text: "Pass the user's email as <code>by</code> so that the row shows their name and avatar. Without it, the action is attributed to <code>system</code> and the row starts with \"System\". Any other value is shown as written, next to a clock icon."
+          - type: "paragraph"
+            data:
+              text: "Expanding a row lists all of a custom action's metadata, a button for each of its <code>links</code>, and the action's name. Metadata like <code>docId</code>, <code>releaseId</code>, <code>datasourceId</code> and <code>assetId</code> also adds a link to that item."
+          - type: "paragraph"
+            data:
+              text: "Without a label, the row uses the action's name, as in \"Ada Lin logged inventory.sync for warehouse-feed\". Labels are stored with each action, so entries logged without one stay that way. The label is on <code>action.label</code> in <code>onAction</code> handlers, while the full action log keeps showing names and raw metadata."
+          - type: "paragraph"
+            data:
+              text: "An <a href=\"/docs/cms/notifications/#email-notifications\">email notification service</a> with no <code>actions</code> list sends an email for every action, including yours, so give it a list if you log custom actions often. From code running in the CMS UI, POST the same fields (<code>action</code>, <code>label</code>, <code>metadata</code> and <code>links</code>) to <code>/cms/api/actions.log</code> to log an action as the signed-in user."
+        time: 1793640090297
+        version: "2.28.2"
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
       _arrayKey: "OTgNps"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "A handler can return <code>{status: 'success' | 'info' | 'error', message}</code> to describe what it did. Errors are logged and don't affect the action or the other services."
         time: 1792454989530
         version: "2.28.2"
       _arrayKey: "XxoQXI"
   _arrayKey: "uaxmYD"
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
       _arrayKey: "Y6CmbF"
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
       _arrayKey: "ehnT1d"
   _arrayKey: "dy7vqd"
 - id: "email-delivery"
   title: "Delivering email"
   body:
     blocks:
       - type: "paragraph"
         data:
           text: "Emails are queued in Firestore at <code>Projects/&lt;id&gt;/Emails</code> and sent by the Root.js email service, a small App Engine app (<code>apps/root-services</code> in the Root.js repo) that reads the queue and sends with the App Engine Mail API. It only reads the queue of the Google Cloud project it runs in, so deploy it to the project that has your Firestore database. Set <code>emailService</code> to its URL so new emails are sent right away, and have a scheduled job call its <code>/_/send_emails?projectId=&lt;id&gt;</code> endpoint every few minutes to send anything that was missed."
       - type: "paragraph"
         data:
           text: "The Mail API sends to at most 100 recipients a day, 8 a minute, and each recipient of an email counts. Emails over the limit are marked as failed and aren't retried, so send alerts to a Google Group address (which counts once) rather than to each person. For more volume, send through a provider like SendGrid with a <a href=\"#notification-services\">custom notification service</a>."
       - type: "paragraph"
         data:
           text: "Emails are sent from <code>noreply@&lt;project-id&gt;.appspotmail.com</code> by default. A different <code>from</code> address must be an authorized sender for the Mail API. Set <code>expireAfterMinutes</code> to skip emails that couldn't be sent in time instead of sending them late."
       - type: "paragraph"
         data:
           text: "Your own server code can send email through the same queue with <code>cmsClient.sendEmail({to, subject, body, htmlBody})</code>."
       - type: "paragraph"
         data:
           text: "A coding agent can set all of this up for you. Paste this prompt in your project:"
     time: 1792454989530
     version: "2.28.2"
   blocks:
     - _type: "CodeBlock"
       code: |-
         Set up email notifications for our CMS. Follow the instructions at
         https://rootjs.dev/skills/root-cms-email-setup.md
       _arrayKey: "YbzmLW"
     - _type: "CopyBlock"
       body:
         blocks:
           - type: "paragraph"
             data:
               text: "The agent asks who should get which emails, then deploys the email service to App Engine, creates the Firestore index and the scheduled job it needs, and adds ready-made emails for releases, publishes, publishing locks and comments to <code>cms/emails.ts</code>. It asks before creating or deploying anything, and ends by sending you a test email. <code>root-cms skill.install</code> also installs the skill, as <code>root-cms-email-setup</code>."
         time: 1793316872401
         version: "2.28.2"
       _arrayKey: "3lDs5p"
   _arrayKey: "d2EUjn"
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
       _arrayKey: "cuNESa"
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
       _arrayKey: "S9Fiyh"
   _arrayKey: "OHvKQE"
```
