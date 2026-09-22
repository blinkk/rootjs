import {
  commentEmailNotifications,
  type CMSNotificationService,
} from '@blinkk/root-cms/plugin';

/** Options for {@link fieldCommentNotifications}. */
interface FieldCommentNotificationsOptions {
  /**
   * Sender email address. The sender must be authorized to send email via the
   * App Engine Mail API. Defaults to
   * `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /**
   * Additional recipients that always receive comment notifications, on top
   * of the mentioned users and thread participants.
   */
  cc?: string[];
  /**
   * Also email the user who wrote the comment (or resolved the thread).
   * Defaults to true here so that comments can be tested end-to-end by a
   * single user; production projects will usually want this off.
   */
  notifySelf?: boolean;
}

/**
 * Email notification service for field comments. Emails the users
 * `@mentioned` in a comment plus everyone who previously commented on the
 * same field whenever a comment is added or a thread is resolved or
 * reopened.
 *
 * To test: open a doc in the CMS, click the comment button next to a field
 * label, and leave a comment that mentions someone (type `@` to autocomplete
 * project users). Emails are queued in `Projects/www/Emails` and delivered by
 * the Root.js email service. With `notifySelf` on, you receive your own
 * comment notifications, so a second account isn't required.
 */
export function fieldCommentNotifications(
  options?: FieldCommentNotificationsOptions
): CMSNotificationService {
  return commentEmailNotifications({
    id: 'field-comment-email',
    label: 'Comment Notifications',
    from: options?.from,
    notifySelf: options?.notifySelf ?? true,
    to: options?.cc || [],
    // Links in the email point at the CMS on this domain.
    cmsUrl: 'https://rootjs.dev',
    template: {
      subject: '[Root.js CMS] {summary}',
      body: [
        '{summary}',
        '',
        '{content}',
        '',
        'Field: {fieldLabel}',
        'Doc: {docId}',
        '',
        'Open in the CMS: {url}',
      ].join('\n'),
      html: [
        '<p>{summary}</p>',
        '<blockquote style="white-space: pre-wrap; border-left: 3px solid #ddd; margin: 12px 0; padding: 4px 12px;">{content}</blockquote>',
        '<p>Field: <strong>{fieldLabel}</strong><br>Doc: {docId}</p>',
        '<p><a href="{url}">Open in the CMS</a></p>',
      ].join('\n'),
    },
    // Notify the email service so the email is sent immediately instead of
    // waiting for the service's cron to process the queue.
    emailService: true,
    // A comment notification that arrives hours late isn't useful.
    expireAfterMinutes: 60,
  });
}
