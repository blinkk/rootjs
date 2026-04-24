import type {CMSService, CMSServiceContext} from './services.js';

/**
 * An email recipient or sender. Either a plain address string
 * (`'jane@example.com'`) or an object with an optional display name.
 */
export type CMSEmailAddress =
  | string
  | {
      /** Email address (e.g. `'jane@example.com'`). */
      email: string;
      /** Optional display name (e.g. `'Jane Doe'`). */
      name?: string;
    };

/** A file attachment to include with an email message. */
export interface CMSEmailAttachment {
  /** Filename to display in the email (e.g. `'invoice.pdf'`). */
  filename: string;
  /** File content. May be a string, a Buffer, or a base64-encoded string. */
  content: string | Buffer;
  /** MIME type of the attachment (e.g. `'application/pdf'`). */
  contentType?: string;
  /** Encoding for the content. Defaults to `'utf-8'` for strings. */
  encoding?: 'utf-8' | 'base64' | 'binary';
}

/** A message to send via an email service. */
export interface CMSEmailMessage {
  /** Recipient address(es). */
  to: CMSEmailAddress | CMSEmailAddress[];
  /** Optional CC address(es). */
  cc?: CMSEmailAddress | CMSEmailAddress[];
  /** Optional BCC address(es). */
  bcc?: CMSEmailAddress | CMSEmailAddress[];
  /**
   * Sender address. If omitted, the email service should fall back to a
   * default sender configured for the service (e.g. via env vars).
   */
  from?: CMSEmailAddress;
  /** Optional reply-to address. */
  replyTo?: CMSEmailAddress;
  /** Subject line. */
  subject: string;
  /** Plain text body. At least one of `text` or `html` must be set. */
  text?: string;
  /** HTML body. At least one of `text` or `html` must be set. */
  html?: string;
  /** Optional attachments. */
  attachments?: CMSEmailAttachment[];
  /** Optional custom headers to set on the outgoing email. */
  headers?: Record<string, string>;
}

/** Result returned by an email service's `send` handler. */
export interface CMSEmailSendResult {
  /**
   * Whether the send succeeded.
   * - `'success'`: the message was accepted by the provider.
   * - `'error'`: the send failed; `message` should describe why.
   */
  status: 'success' | 'error';
  /** Optional human-readable message describing the result. */
  message?: string;
  /** Provider-specific message ID (if returned by the provider). */
  messageId?: string;
}

/** Context passed to an email service `send` handler. */
export interface CMSEmailServiceContext extends CMSServiceContext {}

/**
 * Configuration for defining a CMS email service.
 *
 * Email services send transactional email on behalf of root-cms (e.g. user
 * invitations, change notifications, scheduled exports). Multiple email
 * services may be registered; callers reference a service by its `id`.
 *
 * Example:
 * ```ts
 * cmsPlugin({
 *   services: {
 *     email: {
 *       id: 'sendgrid',
 *       label: 'SendGrid',
 *       send: async (ctx, message) => {
 *         await sendgrid.send(message);
 *         return {status: 'success'};
 *       },
 *     },
 *   },
 * });
 * ```
 */
export interface CMSEmailService extends CMSService {
  /**
   * Server-side function that sends a single email message.
   *
   * Returning a `CMSEmailSendResult` (or `void` to indicate success) signals
   * a successful send. Throw an error to indicate a failure that should be
   * surfaced to the caller.
   */
  send: (
    ctx: CMSEmailServiceContext,
    message: CMSEmailMessage
  ) => Promise<CMSEmailSendResult | void>;
}
