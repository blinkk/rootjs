/**
 * Email notifications for the CMS, set up by the `root-cms-email-setup` agent
 * skill. Each export is a notification service for `cmsPlugin()`; `cmsEmails()`
 * returns the usual set.
 *
 * Usage:
 *
 * ```ts
 * // @/root.config.ts
 * import {cmsEmails} from './cms/emails.js';
 *
 * cmsPlugin({
 *   // ...
 *   notifications: cmsEmails({
 *     siteName: 'My Site',
 *     cmsUrl: 'https://example.com',
 *     emailService: 'https://root-services-dot-my-project.uc.r.appspot.com',
 *     releaseAlerts: ['web-team@example.com'],
 *   }),
 * });
 * ```
 *
 * The emails are plain HTML with inline styles, which is what email clients
 * render reliably, and each has a plain-text version.
 */

import type {Action} from '@blinkk/root-cms';
import {
  type CMSNotificationService,
  type CommentEmailTemplateData,
  type EmailNotificationTemplate,
  commentEmailNotifications,
  emailNotifications,
} from '@blinkk/root-cms/plugin';

/** Settings shared by every email. */
export interface CmsEmailsOptions {
  /** The site's name, used in subjects and the footer. */
  siteName: string;
  /**
   * Base URL the CMS is served from, for links in the emails, e.g.
   * `https://example.com` (the CMS is at `/cms/` under it).
   */
  cmsUrl: string;
  /** Base URL of the deployed Root.js email service. */
  emailService: string;
  /**
   * Sender address. Must be an authorized sender for the App Engine Mail
   * API. Defaults to `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /** Minutes after which an unsent email is dropped. Defaults to 60. */
  expireAfterMinutes?: number;
  /** Who's emailed when a release is published, scheduled or rolled back. */
  releaseAlerts?: string[];
  /**
   * Who's emailed when a single doc is published or unpublished. Publishing
   * a release also publishes each of its docs, so teams that use releases
   * usually want `releaseAlerts` instead.
   */
  publishAlerts?: string[];
  /** Who's emailed when a doc's publishing is locked or unlocked. */
  lockAlerts?: string[];
  /** Email people about field comments that mention them. Defaults to true. */
  comments?: boolean;
}

/** Returns the notification services turned on by `options`. */
export function cmsEmails(options: CmsEmailsOptions): CMSNotificationService[] {
  const services: CMSNotificationService[] = [];
  if (options.releaseAlerts?.length) {
    services.push(releaseEmails(options));
  }
  if (options.publishAlerts?.length) {
    services.push(publishEmails(options));
  }
  if (options.lockAlerts?.length) {
    services.push(lockEmails(options));
  }
  if (options.comments !== false) {
    services.push(commentEmails(options));
  }
  return services;
}

/** Emails `releaseAlerts` when a release is published or rolled back. */
export function releaseEmails(options: CmsEmailsOptions) {
  return emailNotifications({
    ...deliveryOptions(options),
    id: 'release-emails',
    label: 'Release emails',
    actions: [
      'release.publish',
      'release.scheduled_publish',
      'release.schedule',
      'release.rollback',
    ],
    to: options.releaseAlerts || [],
    template: (action: Action) => {
      const meta = action.metadata || {};
      const releaseId = String(meta.releaseId || '');
      const verb =
        {
          'release.publish': 'published',
          'release.scheduled_publish': 'published on schedule',
          'release.schedule': 'scheduled',
          'release.rollback': 'rolled back',
        }[action.action] || action.action;
      const docIds: string[] = Array.isArray(meta.docIds) ? meta.docIds : [];
      const dataSourceIds: string[] = Array.isArray(meta.dataSourceIds)
        ? meta.dataSourceIds
        : [];
      return renderEmail(options, {
        subject: `Release ${releaseId} ${verb}`,
        heading: `Release ${releaseId} was ${verb}${scheduledFor(meta)}`,
        by: action.by,
        message: meta.publishMessage,
        items: [
          ...docIds.map((docId) => ({
            label: docId,
            url: docUrl(options, docId),
          })),
          ...dataSourceIds.map((id) => ({label: `Data source: ${id}`})),
        ],
        button: {
          label: 'View release',
          url: cmsLink(options, `/releases/${encodeURIComponent(releaseId)}`),
        },
      });
    },
  });
}

/** Emails `publishAlerts` when a doc is published or unpublished. */
export function publishEmails(options: CmsEmailsOptions) {
  return emailNotifications({
    ...deliveryOptions(options),
    id: 'publish-emails',
    label: 'Publish emails',
    actions: [
      'doc.publish',
      'doc.scheduled_publish',
      'doc.unpublish',
      'doc.schedule',
    ],
    to: options.publishAlerts || [],
    template: (action: Action) => {
      const meta = action.metadata || {};
      const docId = String(meta.docId || '');
      const verb =
        {
          'doc.publish': 'published',
          'doc.scheduled_publish': 'published on schedule',
          'doc.unpublish': 'unpublished',
          'doc.schedule': 'scheduled',
        }[action.action] || action.action;
      return renderEmail(options, {
        subject: `${docId} ${verb}`,
        heading: `${docId} was ${verb}${scheduledFor(meta)}`,
        by: action.by,
        message: meta.publishMessage,
        button: {label: 'Open in the CMS', url: docUrl(options, docId)},
      });
    },
  });
}

/** Emails `lockAlerts` when a doc's publishing is locked or unlocked. */
export function lockEmails(options: CmsEmailsOptions) {
  return emailNotifications({
    ...deliveryOptions(options),
    id: 'lock-emails',
    label: 'Publishing lock emails',
    actions: ['doc.lock_publishing', 'doc.unlock_publishing'],
    to: options.lockAlerts || [],
    template: (action: Action) => {
      const meta = action.metadata || {};
      const docId = String(meta.docId || '');
      const locked = action.action === 'doc.lock_publishing';
      const until =
        locked && meta.until
          ? ` until ${new Date(meta.until).toUTCString()}`
          : '';
      return renderEmail(options, {
        subject: `Publishing ${locked ? 'locked' : 'unlocked'} for ${docId}`,
        heading: `Publishing ${locked ? 'locked' : 'unlocked'} for ${docId}${until}`,
        by: action.by,
        message: locked ? meta.reason : undefined,
        button: {label: 'Open in the CMS', url: docUrl(options, docId)},
      });
    },
  });
}

/**
 * Emails people `@mentioned` in a field comment, and everyone already in
 * the thread, when a comment is added, resolved or reopened.
 */
export function commentEmails(options: CmsEmailsOptions) {
  return commentEmailNotifications({
    ...deliveryOptions(options),
    cmsUrl: options.cmsUrl,
    template: (data: CommentEmailTemplateData) =>
      renderEmail(options, {
        subject: data.summary,
        heading: data.summary,
        quote: data.content,
        button: data.url
          ? {label: 'Reply in the CMS', url: data.url}
          : undefined,
      }),
  });
}

/** Describes a schedule action's publish time, e.g. " for Fri, 30 Oct…". */
function scheduledFor(meta: {scheduledAt?: number}): string {
  return meta.scheduledAt
    ? ` for ${new Date(meta.scheduledAt).toUTCString()}`
    : '';
}

function deliveryOptions(options: CmsEmailsOptions) {
  return {
    from: options.from,
    emailService: options.emailService,
    expireAfterMinutes: options.expireAfterMinutes ?? 60,
  };
}

/** Builds a link to a CMS page, e.g. `cmsLink(options, '/releases')`. */
function cmsLink(options: CmsEmailsOptions, path: string): string {
  return `${options.cmsUrl.replace(/\/+$/, '')}/cms${path}`;
}

/** Builds a link to a doc in the CMS, from an id like `Pages/about`. */
function docUrl(options: CmsEmailsOptions, docId: string): string {
  const [collection, ...slug] = docId.split('/');
  return cmsLink(
    options,
    `/content/${encodeURIComponent(collection)}/${encodeURIComponent(slug.join('/'))}`
  );
}

/** The parts of an email, all plain text (they're escaped for the HTML). */
interface EmailContent {
  subject: string;
  heading: string;
  /** Email of the user who did it, shown under the heading. */
  by?: string;
  /** A publish message, lock reason, etc. */
  message?: string;
  /** Quoted text, such as a comment. */
  quote?: string;
  /** A list of things, such as the docs in a release. */
  items?: {label: string; url?: string}[];
  button?: {label: string; url: string};
}

/** The most list items an email shows before "and N more". */
const MAX_ITEMS = 25;

/** Renders an email with the site's name in the subject and footer. */
function renderEmail(
  options: CmsEmailsOptions,
  content: EmailContent
): EmailNotificationTemplate {
  const items = content.items || [];
  const shown = items.slice(0, MAX_ITEMS);
  const more = items.length - shown.length;

  const text: string[] = [content.heading];
  if (content.by) {
    text.push(`By ${content.by}`);
  }
  if (content.message) {
    text.push('', content.message);
  }
  if (content.quote) {
    text.push('', content.quote);
  }
  if (shown.length > 0) {
    text.push('', ...shown.map((item) => `- ${item.label}`));
    if (more > 0) {
      text.push(`- and ${more} more`);
    }
  }
  if (content.button) {
    text.push('', `${content.button.label}: ${content.button.url}`);
  }
  text.push('', `-- ${options.siteName}`);

  const html: string[] = [];
  html.push(
    `<h1 style="margin:0 0 4px;font-size:18px;line-height:1.4;color:#1f1f1f;">${esc(content.heading)}</h1>`
  );
  if (content.by) {
    html.push(
      `<p style="margin:0 0 16px;font-size:13px;color:#646b77;">By ${esc(content.by)}</p>`
    );
  }
  if (content.message) {
    html.push(
      `<p style="margin:0 0 16px;white-space:pre-wrap;">${esc(content.message)}</p>`
    );
  }
  if (content.quote) {
    html.push(
      `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #d9a6c8;background:#fbfbf9;white-space:pre-wrap;">${esc(content.quote)}</blockquote>`
    );
  }
  if (shown.length > 0) {
    const lis = shown.map((item) =>
      item.url
        ? `<li><a href="${esc(item.url)}" style="color:#1971c2;">${esc(item.label)}</a></li>`
        : `<li>${esc(item.label)}</li>`
    );
    if (more > 0) {
      lis.push(`<li>and ${more} more</li>`);
    }
    html.push(
      `<ul style="margin:0 0 16px;padding-left:20px;">${lis.join('')}</ul>`
    );
  }
  if (content.button) {
    html.push(
      `<p style="margin:24px 0 0;"><a href="${esc(content.button.url)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#1f1f1f;color:#ffffff;text-decoration:none;font-weight:600;">${esc(content.button.label)}</a></p>`
    );
  }

  return {
    subject: `[${options.siteName}] ${content.subject}`,
    body: text.join('\n'),
    html: `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#f5f5f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e1;border-radius:8px;">
<tr><td style="padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#333333;">
${html.join('\n')}
</td></tr>
</table>
<p style="max-width:560px;margin:12px auto 0;font-family:sans-serif;font-size:12px;color:#646b77;text-align:center;">Sent by the ${esc(options.siteName)} CMS.</p>
</body>
</html>`,
  };
}

/** Escapes text for HTML. Template functions' output isn't escaped for you. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
