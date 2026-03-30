import type {RootConfig} from '@blinkk/root';
import type {RootCMSClient} from './client.js';

/** A row of translation data keyed by locale. */
export interface TranslationRow {
  /** The source string. */
  source: string;
  /** Map of locale code to translated string. */
  translations: Record<string, string>;
  /** Optional translator notes/context for the source string. */
  description?: string;
}

/** Context passed to translation service import/export functions. */
export interface TranslationServiceContext {
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
  /** The locales configured for the project. */
  locales: string[];
}

/** Result returned by an onExport handler. */
export interface TranslationExportResult {
  /** Optional title displayed in the notification after export. */
  title?: string;
  /** Optional message displayed in the notification after export. */
  message?: string;
  /** Optional link displayed in the notification (e.g. to the translation service). */
  link?: {
    /** The URL to link to. */
    url: string;
    /** Optional label for the link. Defaults to "Open". */
    label?: string;
  };
}

/** Configuration for defining a CMS translation service. */
export interface CMSTranslationService {
  /** Unique ID for the translation service. */
  id: string;
  /** Human-readable label displayed in the UI (e.g. "Crowdin"). */
  label: string;
  /**
   * Optional icon URL displayed in the UI next to the label. Similar to the
   * sidebar tools `icon` option, this should be a URL to an image.
   */
  icon?: string;
  /**
   * Async function to import translations from the service. Should return an
   * array of translation rows that will be merged into the CMS translations
   * database.
   */
  onImport?: (
    ctx: TranslationServiceContext,
    data: TranslationRow[]
  ) => Promise<TranslationRow[]>;
  /**
   * Async function to export translations to the service. Receives the
   * current translation rows for the document. Can optionally return an object
   * with a `message` to display in the success notification.
   */
  onExport?: (
    ctx: TranslationServiceContext,
    data: TranslationRow[]
  ) => Promise<void | TranslationExportResult>;
}
