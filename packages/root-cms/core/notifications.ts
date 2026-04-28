import {RootConfig} from '@blinkk/root';
import {RootCMSClient} from './client.js';

/** Context passed to notifications service handlers. */
export interface NotificationServiceContext {
  rootConfig: RootConfig;
  cmsClient: RootCMSClient;
  /** The email of the user performing the action. */
  user: {email: string};
}

/** Payload for invoking a notifications service action. */
export interface NotificationAction {
  /** Action identifier, e.g. `release.published` or `translations.imported`. */
  type: string;
  /** Optional channel hint, e.g. `email`, `slack`, or `sms`. */
  channel?: string;
  /** Optional action-specific metadata. */
  metadata?: Record<string, string>;
  /** Optional action-specific data payload. */
  data?: Record<string, any>;
}

/** Result returned by a notifications service. */
export interface NotificationActionResult {
  id?: string;
  status?: 'queued' | 'sent' | 'failed';
  message?: string;
}

/** Configuration for defining a CMS notifications service. */
export interface CMSNotificationService {
  /** Unique ID for the notifications service. */
  id: string;
  /** Display label shown in Root CMS. */
  label: string;
  /** Optional icon URL or data URI shown in Root CMS. */
  icon?: string;
  /** Handles a notifications action via the configured provider. */
  onAction?: (
    ctx: NotificationServiceContext,
    action: NotificationAction
  ) => Promise<void | NotificationActionResult>;
}
