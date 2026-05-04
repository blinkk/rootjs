import type {Action} from './client.js';
import type {CMSService, CMSServiceContext} from './services.js';

/** Result returned by a notification service `onAction` handler. */
export interface NotificationResult {
  /**
   * Delivery status.
   * - `'success'`: the notification was delivered.
   * - `'error'`: delivery failed; `message` should describe why.
   * - `'info'` (default): the service handled the action but did not
   *   deliver a notification (e.g. the action was filtered out).
   */
  status?: 'success' | 'info' | 'error';
  /** Optional human-readable message describing the result. */
  message?: string;
}

/** Context passed to notification service handler functions. */
export interface NotificationServiceContext extends CMSServiceContext {}

/**
 * Configuration for defining a CMS notification service.
 *
 * Notification services react to actions in the CMS (publishes, schema
 * changes, comments, etc.) and dispatch them to an external channel.
 * Initially this is intended for email, with Slack, webhooks, and other
 * transports planned.
 *
 * Multiple notification services may be registered; each independently
 * decides whether and how to handle a given action.
 *
 * Example:
 * ```ts
 * cmsPlugin({
 *   services: {
 *     notifications: [
 *       {
 *         id: 'sendgrid',
 *         label: 'SendGrid',
 *         onAction: async (ctx, action) => {
 *           if (action.action === 'doc.publish') {
 *             await sendgrid.send({ ... });
 *           }
 *         },
 *       },
 *     ],
 *   },
 * });
 * ```
 */
export interface CMSNotificationService extends CMSService {
  /**
   * Async function called when an action occurs in the CMS. Receives the
   * action and may dispatch a notification (e.g. send email, post to Slack)
   * via the service's underlying transport. Can optionally return a
   * `NotificationResult` describing delivery status.
   */
  onAction?: (
    ctx: NotificationServiceContext,
    action: Action
  ) => Promise<void | NotificationResult>;
}
