import type {
  FieldCommentAction,
  FieldCommentActionMetadata,
} from '../shared/comments.js';
import {FIELD_COMMENT_ACTIONS, normalizeEmails} from '../shared/comments.js';
import type {Action} from './client.js';
import {
  emailNotifications,
  type EmailNotificationTemplate,
  renderEmailTemplate,
} from './services-notifications-email.js';
import type {CMSNotificationService} from './services-notifications.js';
import type {NotificationServiceContext} from './services-notifications.js';

/** Template data passed to {@link CommentEmailNotificationsOptions.template}. */
export interface CommentEmailTemplateData {
  /** The action log entry that triggered the notification. */
  action: Action<FieldCommentActionMetadata>;
  /** Action name, e.g. `doc.comment.add`. */
  actionName: FieldCommentAction;
  /** Email of the user that performed the action. */
  by: string;
  /** Doc id in the form `<collection>/<slug>`. */
  docId: string;
  collectionId: string;
  slug: string;
  /** Deep key of the commented field. */
  fieldKey: string;
  /** Human-readable label of the field, falling back to the deep key. */
  fieldLabel: string;
  /** Plain-text content of the comment (empty for resolve/reopen actions). */
  content: string;
  /** Lower-cased emails mentioned in the comment. */
  mentions: string[];
  /** Lower-cased emails of everyone who has commented on the thread. */
  participants: string[];
  /** Short human-readable description of what happened. */
  summary: string;
  /**
   * Link to the field in the CMS, built from `rootConfig.domain` (or the
   * `cmsUrl` option). Empty when neither is configured.
   */
  url: string;
}

/** Options for the {@link commentEmailNotifications} service. */
export interface CommentEmailNotificationsOptions {
  /** Unique ID for the service. Defaults to `'comment-email'`. */
  id?: string;
  /** Human-readable label displayed in the UI. Defaults to `'Comment emails'`. */
  label?: string;
  /** Optional icon URL displayed in the UI next to the label. */
  icon?: string;
  /**
   * Comment actions that trigger an email. Defaults to new comments,
   * resolves and reopens (`doc.comment.add`, `doc.comment.resolve`,
   * `doc.comment.reopen`).
   */
  actions?: FieldCommentAction[];
  /**
   * Whether to notify users mentioned in the comment via `@mention`.
   * Defaults to true.
   */
  notifyMentions?: boolean;
  /**
   * Whether to notify previous participants of the thread (everyone who has
   * commented on the field). Defaults to true.
   */
  notifyParticipants?: boolean;
  /**
   * Whether to include the user that performed the action in the recipients.
   * Defaults to false.
   */
  notifySelf?: boolean;
  /**
   * Additional recipients, either a static list or a function returning the
   * list for a given action (e.g. doc watchers). Merged with the mentioned
   * users and participants.
   */
  to?:
    | string[]
    | ((
        data: CommentEmailTemplateData,
        ctx: NotificationServiceContext
      ) => string[] | Promise<string[]>);
  /**
   * Optional filter called before sending. Return `false` to skip the
   * notification, e.g. to ignore comments on certain collections.
   */
  filter?: (
    data: CommentEmailTemplateData,
    ctx: NotificationServiceContext
  ) => boolean | Promise<boolean>;
  /**
   * Sender email address. Defaults to
   * `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /**
   * Base URL of the site hosting the CMS, used to build links to the
   * commented field (e.g. `https://example.com`). Defaults to
   * `rootConfig.domain`.
   */
  cmsUrl?: string;
  /**
   * Custom email content. Either `{placeholder}` string templates resolved
   * against {@link CommentEmailTemplateData} (e.g. `{fieldLabel}`,
   * `{by}`, `{content}`, `{url}`) or a function returning the final email.
   * When unset, a default subject and body describing the comment are used.
   */
  template?:
    | EmailNotificationTemplate
    | ((
        data: CommentEmailTemplateData,
        ctx: NotificationServiceContext
      ) => EmailNotificationTemplate | Promise<EmailNotificationTemplate>);
  /**
   * Email service used to trigger delivery immediately after the email is
   * queued. See `emailNotifications()` for details.
   */
  emailService?: string | boolean;
  /** Number of minutes after which an unsent email expires. */
  expireAfterMinutes?: number;
}

const DEFAULT_ACTIONS: FieldCommentAction[] = [
  FIELD_COMMENT_ACTIONS.add,
  FIELD_COMMENT_ACTIONS.resolve,
  FIELD_COMMENT_ACTIONS.reopen,
];

/**
 * Builds the template data for a comment action. Returns `null` when the
 * action isn't a field comment action or is missing required metadata.
 */
export function buildCommentEmailTemplateData(
  action: Action,
  ctx: NotificationServiceContext,
  options?: Pick<CommentEmailNotificationsOptions, 'cmsUrl'>
): CommentEmailTemplateData | null {
  const actionName = action.action as FieldCommentAction;
  if (!Object.values(FIELD_COMMENT_ACTIONS).includes(actionName)) {
    return null;
  }
  const metadata = (action.metadata ||
    {}) as Partial<FieldCommentActionMetadata>;
  if (!metadata.docId || !metadata.fieldKey) {
    return null;
  }
  const [collectionId, slug] = metadata.docId.split('/');
  const by = (action.by || '').toLowerCase();
  const fieldLabel = metadata.fieldLabel || metadata.fieldKey;
  const content = metadata.content || '';
  const mentions = normalizeEmails(metadata.mentions || []);
  const participants = normalizeEmails(metadata.participants || []);
  const summary = describeCommentAction(
    actionName,
    by,
    fieldLabel,
    metadata.docId
  );
  const baseUrl = (options?.cmsUrl || (ctx.rootConfig as any)?.domain || '')
    .toString()
    .replace(/\/+$/, '');
  const url = baseUrl
    ? `${baseUrl}/cms/content/${collectionId}/${slug}?deeplink=${encodeURIComponent(
        metadata.fieldKey
      )}`
    : '';
  return {
    action: action as Action<FieldCommentActionMetadata>,
    actionName,
    by,
    docId: metadata.docId,
    collectionId: metadata.collectionId || collectionId,
    slug: metadata.slug || slug,
    fieldKey: metadata.fieldKey,
    fieldLabel,
    content,
    mentions,
    participants,
    summary,
    url,
  };
}

/** Returns a one-line description of a comment action. */
function describeCommentAction(
  actionName: FieldCommentAction,
  by: string,
  fieldLabel: string,
  docId: string
): string {
  switch (actionName) {
    case FIELD_COMMENT_ACTIONS.add:
      return `${by} commented on "${fieldLabel}" in ${docId}`;
    case FIELD_COMMENT_ACTIONS.edit:
      return `${by} edited a comment on "${fieldLabel}" in ${docId}`;
    case FIELD_COMMENT_ACTIONS.delete:
      return `${by} deleted a comment on "${fieldLabel}" in ${docId}`;
    case FIELD_COMMENT_ACTIONS.resolve:
      return `${by} resolved the comments on "${fieldLabel}" in ${docId}`;
    case FIELD_COMMENT_ACTIONS.reopen:
      return `${by} reopened the comments on "${fieldLabel}" in ${docId}`;
    default:
      return `${by} updated the comments on "${fieldLabel}" in ${docId}`;
  }
}

/** Default subject and body templates used by {@link commentEmailNotifications}. */
export const DEFAULT_COMMENT_EMAIL_TEMPLATE: Readonly<
  Required<EmailNotificationTemplate>
> = Object.freeze({
  subject: '[Root CMS] {summary}',
  body: ['{summary}', '', '{content}', '', '{url}'].join('\n'),
  html: [
    '<p>{summary}</p>',
    '<blockquote style="white-space: pre-wrap; border-left: 3px solid #ddd; margin: 12px 0; padding: 4px 12px;">{content}</blockquote>',
    '<p><a href="{url}">Open in Root CMS</a></p>',
  ].join('\n'),
});

/**
 * Creates a {@link CMSNotificationService} that emails users when field
 * comments are added, resolved, or reopened. By default the recipients are
 * the users `@mentioned` in the comment plus everyone who previously
 * commented on the same field, excluding the user performing the action.
 *
 * Emails are queued in `Projects/{projectId}/Emails` and delivered by the
 * Root.js email service, the same as `emailNotifications()`.
 *
 * Example:
 * ```ts
 * cmsPlugin({
 *   notifications: [
 *     commentEmailNotifications({
 *       emailService: true,
 *       // Also notify a shared inbox for comments on the "Pages" collection.
 *       to: (data) => (data.collectionId === 'Pages' ? ['web@example.com'] : []),
 *     }),
 *   ],
 * });
 * ```
 */
export function commentEmailNotifications(
  options: CommentEmailNotificationsOptions = {}
): CMSNotificationService {
  const actions = options.actions || DEFAULT_ACTIONS;
  const notifyMentions = options.notifyMentions !== false;
  const notifyParticipants = options.notifyParticipants !== false;

  // Template data is derived from the action and reused by `to`, `filter`
  // and `template`, so it is computed once per action in `transformData()`.
  const service = emailNotifications<CommentEmailTemplateData>({
    id: options.id || 'comment-email',
    label: options.label || 'Comment emails',
    icon: options.icon,
    actions,
    from: options.from,
    emailService: options.emailService,
    expireAfterMinutes: options.expireAfterMinutes,
    filter: async (action, ctx) => {
      const data = buildCommentEmailTemplateData(action, ctx, options);
      if (!data) {
        return false;
      }
      if (options.filter && !(await options.filter(data, ctx))) {
        return false;
      }
      return true;
    },
    to: async (action, ctx) => {
      const data = buildCommentEmailTemplateData(action, ctx, options);
      if (!data) {
        return [];
      }
      const recipients: string[] = [];
      if (notifyMentions) {
        recipients.push(...data.mentions);
      }
      if (notifyParticipants) {
        recipients.push(...data.participants);
      }
      if (options.to) {
        const extra =
          typeof options.to === 'function'
            ? await options.to(data, ctx)
            : options.to;
        recipients.push(...(extra || []));
      }
      return normalizeEmails(recipients).filter(
        (email) => options.notifySelf || email !== data.by
      );
    },
    transformData: (action, ctx) =>
      buildCommentEmailTemplateData(action, ctx, options)!,
    template: async (data, action, ctx) => {
      // Function templates are used verbatim; string templates are rendered
      // against the comment template data, with the defaults filling in any
      // missing parts.
      if (typeof options.template === 'function') {
        return options.template(data, ctx);
      }
      const template = {
        ...DEFAULT_COMMENT_EMAIL_TEMPLATE,
        ...(options.template || {}),
      };
      return {
        subject: renderEmailTemplate(template.subject, data),
        body: renderEmailTemplate(template.body, data),
        html: renderEmailTemplate(template.html, data, {escapeHtml: true}),
      };
    },
  });
  return service;
}
