---
'@blinkk/root-cms': minor
---

feat: add `RootEmailNotificationPlugin` for email notifications on CMS actions

- New `RootEmailNotificationPlugin` factory at `@blinkk/root-cms/email-notification` registers a notification service that subscribes to the `onAction()` hook.
- Recipients can be defined as email addresses, role specifiers (e.g. `'role:ADMINS'`), or functions that compute recipients from the action.
- Filter actions in/out via `include`/`exclude` glob patterns or a custom function.
- User-configurable plain-text email templates with `{{var}}` interpolation, including per-action and prefix-glob (e.g. `'tasks.*'`) lookups.
- Dedicated `EmailClient` at `@blinkk/root-cms/email-client` for sending email from any server-side code; emails are queued in Firestore and dispatched by the existing `apps/root-services` Go worker.
- Tasks special case: for `tasks.*` actions, subscribers stored on the task doc plus `@<email>` mentions extracted from comments are automatically notified in addition to any configured recipients.
- New `subscribers` field on `Task`, with subscribe/unsubscribe controls in the task detail page and auto-subscribe on comment.
