import {Request, RootConfig} from '@blinkk/root';
import {RootCMSClient} from './client.js';
import * as schema from './schema.js';

/** The result status of a check. */
export type CheckStatus = 'success' | 'warning' | 'error';

/** Result returned by a check function after execution. */
export interface CheckResult {
  /** Whether the check succeeded, warned, or failed. */
  status: CheckStatus;
  /** A message describing the result. Supports markdown. */
  message: string;
  /** Optional metadata to include with the result. */
  metadata?: Record<string, any>;
}

/** Context passed to a check function during execution. */
export interface CheckContext {
  /** The Root.js config. */
  rootConfig: RootConfig;
  /** The Root CMS client for accessing the database. */
  cmsClient: RootCMSClient;
  /** The document ID, e.g. `Pages/index`. */
  docId: string;
  /** The collection ID, e.g. `Pages`. */
  collectionId: string;
  /** The slug, e.g. `index`. */
  slug: string;
  /** The collection schema. */
  collectionSchema: schema.Collection | null;
}

/** Configuration for defining a CMS check. */
export interface CMSCheck {
  /** Unique ID for the check. */
  id: string;
  /** Human-readable label displayed in the UI. */
  label: string;
  /**
   * Function that runs the check on the server-side and returns a result.
   */
  run: (ctx: CheckContext) => Promise<CheckResult>;
}
