import type {RootConfig} from '@blinkk/root';
import type {RootCMSClient} from './client.js';

/**
 * Base shape for a service registered with the CMS plugin.
 *
 * Services are extension points that let plugins provide capabilities
 * (e.g. email delivery, cache, translations) that root-cms can call into.
 * Every service shares the same identifying fields — `id`, `label`, optional
 * `icon` — and is registered via the `services` option on `cmsPlugin()`.
 *
 * Concrete service interfaces (e.g. `CMSEmailService`,
 * `CMSTranslationService`) extend this base and add the handler functions
 * specific to their capability.
 */
export interface CMSService {
  /** Unique ID for the service (e.g. `'sendgrid'`, `'crowdin'`). */
  id: string;
  /** Human-readable label displayed in the UI (e.g. "SendGrid"). */
  label: string;
  /**
   * Optional icon URL displayed in the UI next to the label. Similar to the
   * sidebar tools `icon` option, this should be a URL to an image.
   */
  icon?: string;
}

/**
 * Base context passed to service handler functions. Concrete services may
 * extend this with additional fields specific to the call site (e.g. the
 * translation context adds `docId`, `collectionId`, etc.).
 */
export interface CMSServiceContext {
  /** The Root.js config. */
  rootConfig: RootConfig;
  /** The Root CMS client for accessing the database. */
  cmsClient: RootCMSClient;
  /**
   * Email of the user that triggered the action, if any. Some service calls
   * are initiated by the system rather than a user, in which case this is
   * undefined.
   */
  user?: {email: string};
}
