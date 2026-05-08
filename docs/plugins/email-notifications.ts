import {
  RootEmailNotificationPlugin,
  type CMSNotificationService,
  type RootEmailNotificationPluginOptions,
} from '@blinkk/root-cms/plugin';

/**
 * Wraps {@link RootEmailNotificationPlugin} with sensible defaults for the
 * docs site. Lets us test the plugin end-to-end without polluting
 * `root.config.ts` with too much detail.
 *
 * Configuration is driven by env vars:
 * - `EMAIL_NOTIFICATIONS_FROM`: sender address (e.g. `noreply@example.com`).
 * - `EMAIL_NOTIFICATIONS_RECIPIENTS`: comma-separated list of base
 *   recipients applied to all notifications. Each entry can be an email or a
 *   `role:<NAME>` reference.
 *
 * If `EMAIL_NOTIFICATIONS_FROM` is not set, this returns `null` so the
 * config can omit the plugin in environments without email.
 */
export function emailNotificationsPlugin(
  overrides: Partial<RootEmailNotificationPluginOptions> = {}
): CMSNotificationService | null {
  const from = overrides.from || process.env.EMAIL_NOTIFICATIONS_FROM;
  if (!from) {
    return null;
  }

  const baseRecipients = (
    process.env.EMAIL_NOTIFICATIONS_RECIPIENTS || 'role:ADMIN'
  )
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  return RootEmailNotificationPlugin({
    from,
    label: 'Docs Email',
    recipients: overrides.recipients ?? baseRecipients,
    filter: overrides.filter ?? {
      // Skip noisy doc-save events; everything else is fair game by default.
      exclude: ['doc.save'],
    },
    templates: {
      'doc.publish': {
        subject: '[rootjs.dev] Published: {{metadata.docId}}',
        body: [
          'Hi,',
          '',
          '{{by}} just published {{metadata.docId}} on rootjs.dev.',
          '',
          'View the doc in the CMS:',
          'https://rootjs.dev/cms/content/{{metadata.docId}}',
          '',
          '— Root CMS',
        ].join('\n'),
      },
      'tasks.create': {
        subject: '[rootjs.dev] Task #{{metadata.taskId}} created',
        body: [
          'Hi,',
          '',
          '{{by}} just created task #{{metadata.taskId}}.',
          '',
          'View the task:',
          'https://rootjs.dev/cms/tasks/{{metadata.taskId}}',
          '',
          '— Root CMS',
        ].join('\n'),
      },
      'tasks.comment.add': {
        subject: '[rootjs.dev] New comment on task #{{metadata.taskId}}',
        body: [
          'Hi,',
          '',
          '{{by}} added a comment to task #{{metadata.taskId}}.',
          '',
          'View the task:',
          'https://rootjs.dev/cms/tasks/{{metadata.taskId}}',
          '',
          '— Root CMS',
        ].join('\n'),
      },
      'tasks.*': {
        subject: '[rootjs.dev] Task #{{metadata.taskId}} updated',
        body: [
          'Hi,',
          '',
          '{{by}} performed "{{action}}" on task #{{metadata.taskId}}.',
          '',
          'View the task:',
          'https://rootjs.dev/cms/tasks/{{metadata.taskId}}',
          '',
          '— Root CMS',
        ].join('\n'),
      },
    },
    ...overrides,
  });
}
