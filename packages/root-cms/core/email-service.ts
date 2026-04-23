import crypto from 'node:crypto';
import {
  type CMSEmailServiceProvider,
  type SendEmailOptions,
  type SendEmailResult,
} from './services.js';

export interface RootEmailServiceOptions {
  /**
   * The URL of the Root.js tools service endpoint for sending emails.
   * This is typically the App Engine service at `/_/send_emails`.
   *
   * Example: `https://tools.example.com/_/send_emails`
   */
  webhookUrl: string;
  /**
   * The Firebase/GCP project ID. Used to scope email queries to the
   * correct Firestore project namespace.
   */
  projectId: string;
  /** Optional shared secret for HMAC-SHA256 request signing. */
  secret?: string;
}

/**
 * Email service that sends emails by calling the Root.js tools App Engine
 * service. The tools service processes pending emails from Firestore and
 * sends them using the App Engine Mail API.
 *
 * Example:
 * ```ts
 * import {rootEmailService} from '@blinkk/root-cms/plugin';
 *
 * cmsPlugin({
 *   email: {
 *     enabled: true,
 *     sender: 'noreply@example.com',
 *     recipients: ['admin@example.com'],
 *     events: ['doc.publish'],
 *     service: rootEmailService({
 *       webhookUrl: 'https://tools.example.com/_/send_emails',
 *       projectId: 'my-project',
 *     }),
 *   },
 * });
 * ```
 */
export function rootEmailService(
  options: RootEmailServiceOptions
): CMSEmailServiceProvider {
  return {
    async sendEmail(emailOptions: SendEmailOptions): Promise<SendEmailResult> {
      try {
        const url = new URL(options.webhookUrl);
        url.searchParams.set('projectId', options.projectId);

        const body = JSON.stringify({
          to: emailOptions.to,
          from: emailOptions.from,
          subject: emailOptions.subject,
          body: emailOptions.body,
          htmlBody: emailOptions.htmlBody,
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (options.secret) {
          const hmac = crypto.createHmac('sha256', options.secret);
          hmac.update(body);
          headers['X-Root-Signature'] = hmac.digest('hex');
        }

        const res = await fetch(url.toString(), {
          method: 'POST',
          headers,
          body,
        });

        if (!res.ok) {
          const text = await res.text();
          return {success: false, error: `HTTP ${res.status}: ${text}`};
        }

        const data = await res.json();
        if (data.success) {
          return {success: true};
        }
        return {success: false, error: data.error || 'unknown error'};
      } catch (err) {
        return {success: false, error: String(err)};
      }
    },
  };
}
