import {Action, RootCMSClient, UserRole} from './client.js';
import {EmailClient, SendEmailOptions} from './email-client.js';
import type {
  CMSNotificationService,
  NotificationResult,
  NotificationServiceContext,
} from './services-notifications.js';

/**
 * A recipient specifier. Can be:
 * - An email address string, e.g. `"foo@example.com"`.
 * - A role reference, e.g. `"role:ADMIN"` or `"role:ADMINS"` (plural is
 *   accepted as an alias). Resolves to all members of the project ACL with
 *   that role.
 * - The literal string `"task:subscribers"`, which resolves to the
 *   subscribers and mentioned users of the task referenced in the action
 *   metadata. Only meaningful for `tasks.*` actions.
 * - A function that receives the notification context and the action and
 *   returns a list of email addresses (or a Promise of one).
 */
export type EmailNotificationRecipient =
  | string
  | ((
      ctx: NotificationServiceContext,
      action: Action
    ) => string[] | Promise<string[]>);

/**
 * Filter spec controlling which actions trigger an email.
 *
 * - `include`: only actions matching one of these names (or prefixes ending
 *   in `*`, e.g. `"doc.*"`) trigger emails. If omitted, all actions are
 *   eligible.
 * - `exclude`: actions matching any of these names (or prefixes) are
 *   skipped. Applied after `include`.
 * - A function form receives the action and returns `true` to send.
 */
export type EmailNotificationFilter =
  | {include?: string[]; exclude?: string[]}
  | ((action: Action) => boolean | Promise<boolean>);

/**
 * Context passed to a {@link EmailNotificationTemplate} function. Provides the
 * raw action plus the resolved recipients so templates can vary copy when
 * needed (e.g. a CC line).
 */
export interface EmailTemplateContext extends NotificationServiceContext {
  /** The action that triggered the notification. */
  action: Action;
  /** Resolved recipient list (deduplicated, lowercased). */
  recipients: string[];
}

/**
 * Output of a template function. `subject` and `body` are required. The
 * notification plugin will not produce HTML email — bodies are plain text
 * only by design.
 */
export interface EmailTemplateOutput {
  subject: string;
  body: string;
}

/**
 * A template can be either an object with literal `subject`/`body` strings
 * containing `{{var}}` interpolations, or a function that returns the
 * template output (sync or async).
 *
 * Available interpolation variables:
 * - `{{action}}` — the action name (e.g. `"doc.publish"`).
 * - `{{by}}` — the email of the user that performed the action.
 * - `{{timestamp}}` — ISO 8601 timestamp.
 * - `{{metadata.<path>}}` — any field on the action metadata, e.g.
 *   `{{metadata.taskId}}`.
 * - `{{recipients}}` — comma-separated list of recipient emails.
 */
export type EmailNotificationTemplate =
  | {subject: string; body: string}
  | ((
      ctx: EmailTemplateContext
    ) => EmailTemplateOutput | Promise<EmailTemplateOutput>);

/** Options accepted by {@link createEmailNotificationService}. */
export interface RootEmailNotificationPluginOptions {
  /** Service id. Defaults to `"email"`. */
  id?: string;
  /** Service label shown in the CMS UI. Defaults to `"Email"`. */
  label?: string;
  /** Optional icon URL displayed alongside the label in the CMS UI. */
  icon?: string;
  /**
   * Sender address used on outgoing email, e.g. `"noreply@example.com"`.
   * Required.
   */
  from: string;
  /** Optional reply-to address applied to all sent email. */
  replyTo?: string;
  /**
   * Recipients of the notification. May be a single recipient or an array.
   * See {@link EmailNotificationRecipient} for accepted shapes.
   */
  recipients: EmailNotificationRecipient | EmailNotificationRecipient[];
  /**
   * Filter controlling which actions are emailed. Defaults to "send for all
   * actions". See {@link EmailNotificationFilter}.
   */
  filter?: EmailNotificationFilter;
  /**
   * Per-action templates. Look up order:
   * 1. Exact action name (e.g. `"doc.publish"`).
   * 2. Prefix match (e.g. `"tasks.*"` matches `"tasks.create"`).
   * 3. The `default` key.
   *
   * If no template matches, a built-in default template is used.
   */
  templates?: Record<string, EmailNotificationTemplate>;
  /**
   * If true, the user that triggered the action is excluded from the
   * recipient list (people generally don't want to be emailed about their own
   * changes). Defaults to `true`. Set to `false` to opt out of this.
   */
  excludeActor?: boolean;
  /**
   * Optional list of action names that recipients can opt out of via the
   * project-level email preferences doc. Recipients added through this
   * mechanism are checked against the per-user `emailPreferences` field at
   * `Projects/<projectId>/Users/<email>` and skipped if they have opted out.
   *
   * Currently a hook for future extension; defaults to honoring all
   * preferences if present.
   */
  honorUserPreferences?: boolean;
}

/**
 * Default template applied when no per-action template matches.
 */
const DEFAULT_TEMPLATE: EmailNotificationTemplate = {
  subject: '[Root CMS] {{action}}',
  body: [
    'Hi,',
    '',
    'A "{{action}}" action was performed in the CMS by {{by}} at {{timestamp}}.',
    '',
    'Metadata:',
    '{{metadata.json}}',
    '',
    '— Root CMS',
  ].join('\n'),
};

/**
 * The plugin reserved key for the special "task subscribers + mentions"
 * recipient.
 */
export const TASK_SUBSCRIBERS_RECIPIENT = 'task:subscribers';

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function matchesActionGlob(action: string, pattern: string): boolean {
  if (pattern === action) {
    return true;
  }
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1); // Keep trailing dot.
    return action.startsWith(prefix);
  }
  if (pattern === '*') {
    return true;
  }
  return false;
}

function matchesAny(action: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesActionGlob(action, pattern));
}

async function applyFilter(
  filter: EmailNotificationFilter | undefined,
  action: Action
): Promise<boolean> {
  if (!filter) {
    return true;
  }
  if (typeof filter === 'function') {
    return Boolean(await filter(action));
  }
  if (filter.include && filter.include.length > 0) {
    if (!matchesAny(action.action, filter.include)) {
      return false;
    }
  }
  if (filter.exclude && filter.exclude.length > 0) {
    if (matchesAny(action.action, filter.exclude)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves a `role:` recipient to the matching emails in the project ACL.
 * Both singular and plural forms are accepted (e.g. `role:ADMIN` and
 * `role:ADMINS`).
 */
async function resolveRoleRecipient(
  cmsClient: RootCMSClient,
  roleSpec: string
): Promise<string[]> {
  const roleStr = roleSpec.slice('role:'.length).toUpperCase();
  // Strip optional trailing 'S' so 'ADMINS' === 'ADMIN'.
  const role = (
    roleStr.endsWith('S') ? roleStr.slice(0, -1) : roleStr
  ) as UserRole;
  const docRef = cmsClient.db.doc(`Projects/${cmsClient.projectId}`);
  const snapshot = await docRef.get();
  const data = snapshot.data() || {};
  const acl = (data.roles || {}) as Record<string, UserRole>;
  const emails: string[] = [];
  for (const [email, userRole] of Object.entries(acl)) {
    if (userRole === role && !email.startsWith('*@')) {
      emails.push(email);
    }
  }
  return emails;
}

/**
 * Resolves the special `task:subscribers` recipient. Returns the union of
 * subscribers stored on the task doc and `@mentions` from the action
 * metadata (for `tasks.comment.add` / `tasks.comment.edit`).
 */
async function resolveTaskRecipients(
  cmsClient: RootCMSClient,
  action: Action
): Promise<string[]> {
  if (!action.action.startsWith('tasks.')) {
    return [];
  }
  const taskId = action.metadata?.taskId;
  if (!taskId) {
    return [];
  }
  const emails = new Set<string>();

  // Mentions are supplied directly on the action metadata (set by
  // ui/utils/tasks.ts when adding/editing comments).
  const mentions: string[] = Array.isArray(action.metadata?.mentions)
    ? action.metadata.mentions
    : [];
  for (const mention of mentions) {
    if (typeof mention === 'string' && mention.includes('@')) {
      emails.add(mention.toLowerCase());
    }
  }

  // Read the task doc for stored subscribers.
  try {
    const taskRef = cmsClient.db.doc(
      `Projects/${cmsClient.projectId}/Tasks/${taskId}`
    );
    const snapshot = await taskRef.get();
    const data = snapshot.data() || {};
    const subscribers: unknown = data.subscribers;
    if (Array.isArray(subscribers)) {
      for (const sub of subscribers) {
        if (typeof sub === 'string' && sub.includes('@')) {
          emails.add(sub.toLowerCase());
        }
      }
    }
    // The task assignee and creator are also notified by default.
    for (const key of ['assignee', 'createdBy']) {
      const value = data[key];
      if (typeof value === 'string' && value.includes('@')) {
        emails.add(value.toLowerCase());
      }
    }
  } catch (err) {
    console.error('failed to read task subscribers:', err);
  }

  return Array.from(emails);
}

async function resolveRecipient(
  ctx: NotificationServiceContext,
  recipient: EmailNotificationRecipient,
  action: Action
): Promise<string[]> {
  if (typeof recipient === 'function') {
    return await recipient(ctx, action);
  }
  if (recipient.startsWith('role:')) {
    return await resolveRoleRecipient(ctx.cmsClient, recipient);
  }
  if (recipient === TASK_SUBSCRIBERS_RECIPIENT) {
    return await resolveTaskRecipients(ctx.cmsClient, action);
  }
  return [recipient];
}

function dedupeLower(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    if (!email) {
      continue;
    }
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Looks up a value at a dot-separated path on `obj`. Returns `undefined` if
 * any segment is missing.
 */
function lookupPath(obj: any, path: string): unknown {
  if (!obj) {
    return undefined;
  }
  const parts = path.split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) {
      return undefined;
    }
    cur = cur[part];
  }
  return cur;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Replaces `{{var}}` tokens in a template string. */
function interpolate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    if (key === 'metadata.json') {
      return formatValue(variables.metadata);
    }
    return formatValue(lookupPath(variables, key));
  });
}

function findTemplate(
  templates: Record<string, EmailNotificationTemplate> | undefined,
  actionName: string
): EmailNotificationTemplate {
  if (!templates) {
    return DEFAULT_TEMPLATE;
  }
  if (templates[actionName]) {
    return templates[actionName];
  }
  // Try prefix matches like `tasks.*`.
  const prefixMatches = Object.keys(templates)
    .filter((key) => key.endsWith('.*'))
    .sort((a, b) => b.length - a.length); // Longest match wins.
  for (const key of prefixMatches) {
    if (matchesActionGlob(actionName, key)) {
      return templates[key];
    }
  }
  if (templates.default) {
    return templates.default;
  }
  return DEFAULT_TEMPLATE;
}

async function renderTemplate(
  template: EmailNotificationTemplate,
  ctx: EmailTemplateContext
): Promise<EmailTemplateOutput> {
  if (typeof template === 'function') {
    return await template(ctx);
  }
  const variables = {
    action: ctx.action.action,
    by: ctx.action.by || 'system',
    timestamp: ctx.action.timestamp?.toDate?.()?.toISOString() || '',
    metadata: ctx.action.metadata || {},
    recipients: ctx.recipients.join(', '),
  };
  return {
    subject: interpolate(template.subject, variables),
    body: interpolate(template.body, variables),
  };
}

async function readUserOptOuts(
  cmsClient: RootCMSClient,
  emails: string[],
  actionName: string
): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }
  const optedOut = new Set<string>();
  // Read each user prefs doc in parallel. Missing docs are treated as
  // "subscribed to all".
  await Promise.all(
    emails.map(async (email) => {
      try {
        const ref = cmsClient.db.doc(
          `Projects/${cmsClient.projectId}/EmailPreferences/${email}`
        );
        const snapshot = await ref.get();
        if (!snapshot.exists) {
          return;
        }
        const data = snapshot.data() || {};
        const optOuts: unknown = data.optOut;
        if (Array.isArray(optOuts) && matchesAny(actionName, optOuts)) {
          optedOut.add(email);
        }
      } catch (err) {
        // Best-effort: a failure here should not block delivery.
        console.error(`failed to read email prefs for ${email}:`, err);
      }
    })
  );
  return optedOut;
}

/**
 * Creates a {@link CMSNotificationService} that sends email when CMS actions
 * fire. Pass the returned object to `cmsPlugin({notifications: [...]})`.
 *
 * Example:
 * ```ts
 * import {cmsPlugin} from '@blinkk/root-cms/plugin';
 * import {RootEmailNotificationPlugin} from '@blinkk/root-cms/email-notification';
 *
 * cmsPlugin({
 *   notifications: [
 *     RootEmailNotificationPlugin({
 *       from: 'noreply@example.com',
 *       recipients: ['role:ADMINS', 'editor@example.com'],
 *       filter: {include: ['doc.publish', 'tasks.*']},
 *       templates: {
 *         'doc.publish': {
 *           subject: 'Doc {{metadata.docId}} published',
 *           body: '{{by}} just published {{metadata.docId}}.',
 *         },
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function RootEmailNotificationPlugin(
  options: RootEmailNotificationPluginOptions
): CMSNotificationService {
  if (!options.from) {
    throw new Error('RootEmailNotificationPlugin: "from" is required');
  }
  if (
    options.recipients === undefined ||
    options.recipients === null ||
    (Array.isArray(options.recipients) && options.recipients.length === 0)
  ) {
    throw new Error(
      'RootEmailNotificationPlugin: "recipients" must include at least one entry'
    );
  }
  const id = options.id || 'email';
  const label = options.label || 'Email';
  const recipients = normalizeArray(options.recipients);
  const excludeActor = options.excludeActor !== false;
  const honorUserPreferences = options.honorUserPreferences !== false;

  return {
    id,
    label,
    icon: options.icon,
    onAction: async (
      ctx: NotificationServiceContext,
      action: Action
    ): Promise<NotificationResult> => {
      // Step 1: filter actions.
      const allowed = await applyFilter(options.filter, action);
      if (!allowed) {
        return {
          status: 'info',
          message: `skipped: action "${action.action}" filtered out`,
        };
      }

      // Step 2: resolve recipients.
      const resolvedLists = await Promise.all(
        recipients.map((r) => resolveRecipient(ctx, r, action))
      );
      // Special case: for `tasks.*` actions, always include subscribers and
      // mentions even if the user did not list `task:subscribers` explicitly.
      // This matches the documented "tasks special case" behavior.
      if (action.action.startsWith('tasks.')) {
        resolvedLists.push(await resolveTaskRecipients(ctx.cmsClient, action));
      }
      let allRecipients = dedupeLower(resolvedLists.flat());

      // Step 3: exclude actor and check per-user opt-outs.
      if (excludeActor && action.by) {
        const actor = action.by.toLowerCase();
        allRecipients = allRecipients.filter((email) => email !== actor);
      }
      if (honorUserPreferences) {
        const optedOut = await readUserOptOuts(
          ctx.cmsClient,
          allRecipients,
          action.action
        );
        if (optedOut.size > 0) {
          allRecipients = allRecipients.filter((email) => !optedOut.has(email));
        }
      }

      if (allRecipients.length === 0) {
        return {
          status: 'info',
          message: `skipped: no recipients for action "${action.action}"`,
        };
      }

      // Step 4: render template.
      const template = findTemplate(options.templates, action.action);
      const templateCtx: EmailTemplateContext = {
        ...ctx,
        action,
        recipients: allRecipients,
      };
      const rendered = await renderTemplate(template, templateCtx);

      // Step 5: queue email.
      const emailClient = new EmailClient(ctx.cmsClient);
      const sendOptions: SendEmailOptions = {
        from: options.from,
        to: allRecipients,
        subject: rendered.subject,
        body: rendered.body,
        tags: [`action:${action.action}`],
      };
      if (options.replyTo) {
        sendOptions.replyTo = options.replyTo;
      }
      try {
        const result = await emailClient.send(sendOptions);
        return {
          status: 'success',
          message: `queued email ${result.id} to ${allRecipients.length} recipient(s)`,
        };
      } catch (err: any) {
        return {
          status: 'error',
          message: `failed to queue email: ${err?.message || String(err)}`,
        };
      }
    },
  };
}
