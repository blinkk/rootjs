import type {Action} from './client.js';
import type {
  CMSNotificationService,
  NotificationServiceContext,
} from './services-notifications.js';

/**
 * Email content used by the {@link emailNotifications} service.
 *
 * When provided as string templates (via the `template` option), each value
 * supports `{placeholder}` tokens that are resolved against the template data
 * — the action log data object, or the result of `transformData()` when
 * configured. Tokens support dot notation for nested values, e.g.
 * `{metadata.docId}`. Unknown placeholders are left untouched.
 */
export interface EmailNotificationTemplate {
  /** Subject line. */
  subject?: string;
  /** Plain-text body. */
  body?: string;
  /**
   * HTML body. Values injected into an HTML string template are HTML-escaped.
   * Omit (while providing `body`) to send a plain-text-only email.
   */
  html?: string;
}

/** Options for the {@link emailNotifications} service. */
export interface EmailNotificationsOptions<T = any> {
  /** Unique ID for the service. Defaults to `'email'`. */
  id?: string;
  /** Human-readable label displayed in the UI. Defaults to `'Email'`. */
  label?: string;
  /** Optional icon URL displayed in the UI next to the label. */
  icon?: string;
  /**
   * Recipients of the email notification. Either a static list of email
   * addresses or a function that returns the recipients for a given action
   * (e.g. to look up watchers of a doc). Returning an empty list skips the
   * notification.
   */
  to:
    | string[]
    | ((
        action: Action,
        ctx: NotificationServiceContext
      ) => string[] | Promise<string[]>);
  /**
   * Sender email address. The sender must be authorized to send email via the
   * App Engine Mail API, e.g. `noreply@<gcp-project-id>.appspotmail.com`.
   * Defaults to `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /**
   * Actions that trigger an email notification, e.g.
   * `['doc.publish', 'release.*']`. Patterns support wildcards, where `*`
   * matches any number of characters and `?` matches a single character.
   * Matching is case-insensitive. When unset, all actions trigger an email
   * notification.
   */
  actions?: string[];
  /**
   * Optional filter called after the `actions` patterns match. Return `false`
   * to skip the notification (e.g. to ignore actions performed by certain
   * users).
   */
  filter?: (
    action: Action,
    ctx: NotificationServiceContext
  ) => boolean | Promise<boolean>;
  /**
   * Optional transformation applied to the action log data before the email
   * templates are rendered. The returned value is passed to the templates as
   * the template data. When unset, the action log data object is used as-is.
   */
  transformData?: (
    action: Action,
    ctx: NotificationServiceContext
  ) => T | Promise<T>;
  /**
   * Templates used to render the email. Either an object with `{placeholder}`
   * string templates or a function that returns the final email content for
   * full control. Function results are used verbatim, i.e. no placeholder
   * rendering or HTML escaping is applied.
   *
   * A missing `subject` falls back to the default subject template. The
   * default body and html templates (see `DEFAULT_EMAIL_TEMPLATE`) apply only
   * when neither `body` nor `html` is provided. Providing only `body` sends a
   * plain-text-only email; providing only `html` derives the plain-text body
   * from the html.
   */
  template?:
    | EmailNotificationTemplate
    | ((
        data: T,
        action: Action,
        ctx: NotificationServiceContext
      ) => EmailNotificationTemplate | Promise<EmailNotificationTemplate>);
  /**
   * Email service used to trigger delivery immediately after the email is
   * queued. Setting this to `true` uses the default hosted service at
   * https://services.rootjs.dev. Set to a base URL to use a self-hosted
   * deployment of the service (`apps/root-services`). When unset, the email
   * remains queued until the email service's cron next processes the queue.
   */
  emailService?: string | boolean;
  /**
   * Number of minutes after which an unsent email expires. Expired emails are
   * skipped by the email service instead of being delivered late. When unset,
   * queued emails never expire.
   */
  expireAfterMinutes?: number;
}

/**
 * Default templates used by {@link emailNotifications} when no custom
 * template content is provided. Exported so custom templates can compose with
 * the defaults, e.g.
 * `template: {...DEFAULT_EMAIL_TEMPLATE, subject: 'Custom subject'}`.
 */
export const DEFAULT_EMAIL_TEMPLATE: Readonly<
  Required<EmailNotificationTemplate>
> = Object.freeze({
  subject: '[Root CMS] {action} by {by}',
  body: [
    'Action: {action}',
    'By: {by}',
    'Time: {timestamp}',
    '',
    'Metadata:',
    '{metadata}',
  ].join('\n'),
  html: [
    '<h2>{action}</h2>',
    '<p><strong>By:</strong> {by}<br><strong>Time:</strong> {timestamp}</p>',
    '<pre>{metadata}</pre>',
  ].join('\n'),
});

/**
 * Creates a {@link CMSNotificationService} that sends email notifications
 * when actions occur in the CMS (publishes, schema changes, etc.).
 *
 * Emails are queued in the `Projects/${projectId}/Emails` collection in
 * firestore and delivered by the Root.js email service (`apps/root-services`)
 * using the App Engine Mail API.
 *
 * Example:
 * ```ts
 * cmsPlugin({
 *   notifications: [
 *     emailNotifications({
 *       actions: ['doc.publish', 'release.*'],
 *       to: ['cms-alerts@example.com'],
 *       template: {
 *         subject: '[cms] {metadata.docId} published by {by}',
 *       },
 *       emailService: true,
 *     }),
 *   ],
 * });
 * ```
 */
export function emailNotifications<T = any>(
  options: EmailNotificationsOptions<T>
): CMSNotificationService {
  return {
    id: options.id || 'email',
    label: options.label || 'Email',
    icon: options.icon,
    onAction: async (ctx, action) => {
      // Filter by the configured action patterns.
      if (options.actions && !matchesAction(options.actions, action.action)) {
        return {status: 'info', message: `ignored action: ${action.action}`};
      }
      if (options.filter && !(await options.filter(action, ctx))) {
        return {status: 'info', message: `filtered action: ${action.action}`};
      }

      // Resolve the recipients list.
      const to =
        typeof options.to === 'function'
          ? await options.to(action, ctx)
          : options.to;
      const recipients = (to || [])
        .map((email) => String(email).trim())
        .filter(Boolean);
      if (recipients.length === 0) {
        return {status: 'info', message: 'no recipients'};
      }

      // Build the template data from the action log data object, optionally
      // transformed via `transformData()`.
      const data = options.transformData
        ? await options.transformData(action, ctx)
        : action;

      // Render the email content.
      let email: EmailNotificationTemplate;
      if (typeof options.template === 'function') {
        email = {...(await options.template(data, action, ctx))};
        if (!email.subject) {
          email.subject = renderEmailTemplate(
            DEFAULT_EMAIL_TEMPLATE.subject,
            data
          );
        }
        if (!email.body && !email.html) {
          email.body = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATE.body, data);
        }
      } else {
        // The default body and html templates apply only when the template
        // provides neither, so that a body-only template sends a
        // plain-text-only email (and an html-only template derives its
        // plain-text body from the html in `sendEmail()`).
        const template = options.template || {};
        email = {
          subject: renderEmailTemplate(
            template.subject || DEFAULT_EMAIL_TEMPLATE.subject,
            data
          ),
        };
        if (template.body) {
          email.body = renderEmailTemplate(template.body, data);
        }
        if (template.html) {
          email.html = renderEmailTemplate(template.html, data, {
            escapeHtml: true,
          });
        }
        if (!email.body && !email.html) {
          email.body = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATE.body, data);
          email.html = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATE.html, data, {
            escapeHtml: true,
          });
        }
      }

      // Queue the email for delivery.
      const emailId = await ctx.cmsClient.sendEmail({
        to: recipients,
        from: options.from,
        subject: email.subject!,
        body: email.body,
        htmlBody: email.html,
        expiresAt: options.expireAfterMinutes
          ? new Date(Date.now() + options.expireAfterMinutes * 60 * 1000)
          : undefined,
        emailService: options.emailService,
      });
      return {
        status: 'success',
        message: `queued email ${emailId} to ${recipients.length} recipient(s)`,
      };
    },
  };
}

/**
 * Renders a `{placeholder}` template string using values from `data`.
 * Placeholders support dot notation for nested lookups, e.g.
 * `{metadata.docId}`. Unknown placeholders are left untouched. Values are
 * stringified based on their type: firestore timestamps and dates are
 * converted to ISO strings and objects are converted to formatted JSON. When
 * `escapeHtml` is set, values are HTML-escaped before injection.
 */
export function renderEmailTemplate(
  template: string,
  data: any,
  options?: {escapeHtml?: boolean}
): string {
  return template.replace(/\{(.+?)\}/g, (match: string, key: string) => {
    const value = getNestedValue(data, key.trim());
    if (!isDef(value)) {
      return match;
    }
    const str = stringifyValue(value);
    if (options?.escapeHtml) {
      return escapeHtml(str);
    }
    return str;
  });
}

/**
 * Cache of compiled wildcard patterns. `onAction` is called for every CMS
 * action, so we avoid recompiling the same pattern on every call.
 */
const wildcardRegExpCache = new Map<string, RegExp>();

/**
 * Converts a wildcard pattern (e.g. `doc.*`) to a case-insensitive RegExp.
 * Supports `*` (matches any number of characters) and `?` (matches a single
 * character). Compiled regexes are memoized per pattern.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const cached = wildcardRegExpCache.get(pattern);
  if (cached) {
    return cached;
  }
  const regexStr = pattern
    // Escape regex special chars except `*` and `?`.
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regExp = new RegExp(`^${regexStr}$`, 'i');
  wildcardRegExpCache.set(pattern, regExp);
  return regExp;
}

/**
 * Returns true if the action name matches any of the wildcard patterns, e.g.
 * `matchesAction(['doc.*'], 'doc.publish')`.
 */
function matchesAction(patterns: string[], action: string): boolean {
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(action));
}

/** Returns true if the value is defined (not `undefined` and not `null`). */
function isDef(value: any): boolean {
  return value !== undefined && value !== null;
}

/** Returns a nested value from an object using dot notation. */
function getNestedValue(data: any, key: string): any {
  let current = data;
  for (const part of key.split('.')) {
    if (!isDef(current) || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/** Stringifies a template value for injection into an email. */
function stringifyValue(value: any): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Format firestore `Timestamp` values as ISO strings.
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/** Escapes HTML special characters. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
