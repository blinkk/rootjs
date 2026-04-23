/**
 * Services are optional integrations that plugins can register to enable
 * extra functionality in Root CMS. For example, registering an email service
 * enables the CMS to send email notifications when actions occur.
 *
 * Services are configured via the `services` option in `cmsPlugin()`:
 *
 * ```ts
 * cmsPlugin({
 *   services: {
 *     email: rootEmailService({
 *       webhookUrl: 'https://tools.example.com/_/send_emails',
 *     }),
 *   },
 * });
 * ```
 */

/** Options for sending an email. */
export interface SendEmailOptions {
  /** Recipient email addresses. */
  to: string[];
  /** Sender email address. */
  from: string;
  /** Email subject. */
  subject: string;
  /** Plain text body. */
  body: string;
  /** HTML body (optional). */
  htmlBody?: string;
}

/** Result returned after sending an email. */
export interface SendEmailResult {
  /** Whether the email was sent successfully. */
  success: boolean;
  /** Error message if the send failed. */
  error?: string;
}

/**
 * Interface for an email service that can send emails. Implement this
 * interface to integrate with any email provider (e.g. App Engine Mail API,
 * SendGrid, Mailgun, etc.).
 *
 * Example:
 * ```ts
 * const myEmailService: CMSEmailService = {
 *   async sendEmail(options) {
 *     // Send the email using your provider.
 *     return {success: true};
 *   },
 * };
 * ```
 */
export interface CMSEmailServiceProvider {
  /** Sends an email. */
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}

/**
 * Map of optional services that can be registered with Root CMS.
 */
export interface CMSServices {
  /** Email service for sending emails. */
  email?: CMSEmailServiceProvider;
}
