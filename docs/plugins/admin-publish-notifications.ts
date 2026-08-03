import {
  emailNotifications,
  type CMSNotificationService,
  type NotificationServiceContext,
} from '@blinkk/root-cms/plugin';

/** Options for {@link adminPublishNotifications}. */
interface AdminPublishNotificationsOptions {
  /**
   * Sender email address. The sender must be authorized to send email via the
   * App Engine Mail API. Defaults to
   * `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /**
   * Additional recipients that always receive the notification, on top of the
   * project's admins.
   */
  cc?: string[];
}

/** Template data rendered into the publish notification email. */
interface PublishEmailData {
  /** Doc id that was published, e.g. `Pages/index`. */
  docId: string;
  /** Email of the user that published the doc, or `system`. */
  by: string;
  /** Time the doc was published, as an ISO timestamp. */
  publishedAt: string;
  /** Publish message entered by the user, or `(none)` when empty. */
  publishMessage: string;
  /** URL to the doc in the CMS. */
  cmsUrl: string;
}

/**
 * Returns the email addresses of every user with the `ADMIN` role in the
 * project's ACL. Wildcard domain entries (e.g. `*@example.com`) are ignored
 * since they aren't deliverable addresses.
 */
async function getAdminEmails(
  ctx: NotificationServiceContext
): Promise<string[]> {
  const cmsClient = ctx.cmsClient;
  const docRef = cmsClient.db.doc(`Projects/${cmsClient.projectId}`);
  const snapshot = await docRef.get();
  const roles: Record<string, string> = snapshot.data()?.roles || {};
  return Object.entries(roles)
    .filter(([email, role]) => role === 'ADMIN' && !email.startsWith('*@'))
    .map(([email]) => email);
}

/**
 * Email notification service that notifies the project's admins whenever a doc
 * is published.
 *
 * Emails are queued in the `Projects/${projectId}/Emails` collection in
 * firestore and delivered by the Root.js email service.
 */
export function adminPublishNotifications(
  options?: AdminPublishNotificationsOptions
): CMSNotificationService {
  return emailNotifications<PublishEmailData>({
    id: 'admin-publish-email',
    label: 'Publish Notifications',
    from: options?.from,
    // `doc.scheduled_publish` is logged by the CMS cron when a scheduled doc
    // goes live, and shares the same metadata shape as `doc.publish`.
    actions: ['doc.publish', 'doc.scheduled_publish'],
    to: async (action, ctx) => {
      const admins = await getAdminEmails(ctx);
      return [...admins, ...(options?.cc || [])];
    },
    transformData: (action, ctx) => {
      const docId = action.metadata?.docId || 'unknown';
      const domain = ctx.rootConfig.domain || '';
      return {
        docId: docId,
        by: action.by || 'system',
        publishedAt: action.timestamp.toDate().toISOString(),
        publishMessage: action.metadata?.publishMessage || '(none)',
        cmsUrl: `${domain}/cms/content/${docId}`,
      };
    },
    template: {
      subject: '[Root.js CMS] {docId} was published by {by}',
      body: [
        '{docId} was published by {by}.',
        '',
        'Time: {publishedAt}',
        'Message: {publishMessage}',
        '',
        'View in the CMS: {cmsUrl}',
      ].join('\n'),
      html: [
        '<p><strong>{docId}</strong> was published by {by}.</p>',
        '<p>Time: {publishedAt}<br>Message: {publishMessage}</p>',
        '<p><a href="{cmsUrl}">View in the CMS</a></p>',
      ].join('\n'),
    },
    // Notify the email service so the email is sent immediately instead of
    // waiting for the service's cron to process the queue.
    emailService: true,
    // Publish notifications lose their value if they arrive hours late.
    expireAfterMinutes: 60,
  });
}
