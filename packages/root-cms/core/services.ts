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
 * Interface for an email service provider that can send emails. Implement
 * this interface to integrate with any email provider (e.g. App Engine Mail
 * API, SendGrid, Mailgun, etc.).
 *
 * Example:
 * ```ts
 * const myEmailService: CMSEmailServiceProvider = {
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
