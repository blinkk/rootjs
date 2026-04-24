import {RootConfig} from '@blinkk/root';
import {RootCMSClient} from './client.js';

/** Context passed to email service handlers. */
export interface EmailServiceContext {
  rootConfig: RootConfig;
  cmsClient: RootCMSClient;
  /** The email of the user performing the action. */
  user: {email: string};
}

/** Payload for sending one email via a service provider. */
export interface EmailSendRequest {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

/** Result returned by an email service after sending an email. */
export interface EmailSendResult {
  id?: string;
  status?: 'queued' | 'sent' | 'failed';
  message?: string;
}

/** Configuration for defining a CMS email service. */
export interface CMSEmailService {
  /** Unique ID for the email service. */
  id: string;
  /** Display label shown in Root CMS. */
  label: string;
  /** Optional icon URL or data URI shown in Root CMS. */
  icon?: string;
  /** Sends an email via the configured provider. */
  onSend: (
    ctx: EmailServiceContext,
    request: EmailSendRequest
  ) => Promise<void | EmailSendResult>;
}
