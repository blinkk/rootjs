import crypto from 'node:crypto';
import {type Plugin, type RootConfig} from '@blinkk/root';
import {App} from 'firebase-admin/app';
import {
  FieldValue,
  Firestore,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {normalizeSlug} from '../shared/slug.js';
import {isCronDue} from './cron-schedule.js';
import type {DependencyGraph} from './dependency-graph.js';
import {CMSPlugin} from './plugin.js';
import {Collection} from './schema.js';
import {
  TranslationsLocaleDoc,
  TranslationsLocaleDocWithRef,
  TranslationsManager,
  buildTranslationsDbPath,
  buildTranslationsLocaleDocDbPath,
  chunkArray,
} from './translations-manager.js';
import {validateFields} from './validation.js';
import {setValueAtPath} from './values.js';

/**
 * Maximum number of bytes allowed in a Firestore document id. Slugs are used
 * as document ids, so a slug exceeding this limit cannot exist in the database.
 * See https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields
 */
const FIRESTORE_DOC_ID_MAX_BYTES = 1500;

/**
 * Base URL of the default hosted Root.js services backend
 * (`apps/root-services`), which provides the email service used by
 * `sendEmail()`.
 */
const DEFAULT_EMAIL_SERVICE_URL = 'https://services.rootjs.dev';

/** Max time to wait for the email service to process the email queue. */
const EMAIL_SERVICE_TIMEOUT_MS = 60 * 1000;

export interface Doc<Fields = any> {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
  sys: {
    createdAt: number;
    createdBy: string;
    modifiedAt: number;
    modifiedBy: string;
    firstPublishedAt?: number;
    firstPublishedBy?: string;
    publishedAt?: number;
    publishedBy?: string;
    publishingLocked: {
      lockedAt: string;
      lockedBy: string;
      reason: string;
      until?: Timestamp;
    };
    locales?: string[];
    /**
     * Reverse index of asset library ids embedded in the doc's fields,
     * (re)computed whenever the doc draft is saved in the CMS UI.
     */
    assets?: string[];
    /**
     * Fractional-index string defining the doc's custom order within the
     * collection. See the `customSorting` collection option.
     */
    sortKey?: string;
  };
  fields: Fields;
}

export type DocMode = 'draft' | 'published';

export type UserRole = 'ADMIN' | 'EDITOR' | 'CONTRIBUTOR' | 'VIEWER';

export type HttpMethod = 'GET' | 'POST';

export type CronUnit = 'minutes' | 'hours' | 'days';

/**
 * Data source sync schedule type.
 *
 * - `interval`: sync every N minutes/hours/days (uses `interval` + `unit`).
 * - `daily` / `weekly` / `custom`: sync on a specific cron schedule (uses
 *   `expression` + `timezone`). `daily` and `weekly` are UI presets that are
 *   stored as standard cron expressions; `custom` allows an arbitrary
 *   expression.
 */
export type CronScheduleType = 'interval' | 'daily' | 'weekly' | 'custom';

export interface DataSourceCron {
  enabled: boolean;
  /**
   * Scheduling mode. Defaults to `interval` when unset (for backwards
   * compatibility with data sources created before specific schedules were
   * supported).
   */
  schedule?: CronScheduleType;
  /** Interval value, used when `schedule` is `interval`. */
  interval?: number;
  /** Interval unit, used when `schedule` is `interval`. */
  unit?: CronUnit;
  /**
   * Standard 5-field cron expression, used when `schedule` is `daily`,
   * `weekly`, or `custom`, e.g. `0 19 * * *` for "every day at 7pm".
   */
  expression?: string;
  /**
   * IANA timezone used to evaluate `expression`, e.g. `America/New_York`.
   * Defaults to UTC when unset.
   */
  timezone?: string;
  autoPublish?: boolean;
}

export interface DataSource {
  id: string;
  description?: string;
  type: 'http' | 'gsheet';
  url: string;
  /**
   * Currently only used by gsheet. `array` returns the sheet as an array of
   * arrays, `map` returns the sheet as an array of objects.
   */
  dataFormat?: 'array' | 'map';
  /**
   * Options for HTTP requests.
   */
  httpOptions?: {
    method: HttpMethod;
    headers?: Record<string, string>;
    body?: string;
  };
  cron?: DataSourceCron;
  createdAt: Timestamp;
  createdBy: string;
  syncedAt?: Timestamp;
  syncedBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
  archivedAt?: Timestamp;
  archivedBy?: string;
}

export interface DataSourceData<T = any> {
  dataSource: DataSource;
  data: T;
  /** Optional list of column headers (for gsheet sources). */
  headers?: string[];
}

export type DataSourceMode = 'draft' | 'published';

export interface GetDocOptions {
  /** Mode, either "draft" or "published". */
  mode: DocMode;
}

export interface SetDocOptions {
  /** Mode, either "draft" or "published". */
  mode: DocMode;
}

export interface SaveDraftOptions {
  /**
   * Locales to enable.
   */
  locales?: string[];

  /**
   * Email of user modifying the doc. If blank, defaults to `root-cms-client`.
   */
  modifiedBy?: string;

  /**
   * Whether to validate fieldsData against the collection schema before saving.
   * If validation fails, an error will be thrown with details about the validation errors.
   */
  validate?: boolean;
}

export interface UpdateDraftOptions {
  /**
   * Whether to validate the updated field against the collection schema.
   * If validation fails, an error will be thrown with details about the validation errors.
   */
  validate?: boolean;
}

export interface ListDocsOptions {
  mode: DocMode;
  offset?: number;
  limit?: number;
  /**
   * DB field path to order results by, e.g. `sys.createdAt`.
   *
   * For collections with the `customSorting` option, when `orderBy` and
   * `query` are both unset, results default to the custom order (i.e.
   * `orderBy: 'sys.sortKey'`). Pass an explicit `orderBy` to override.
   */
  orderBy?: string;
  orderByDirection?: 'asc' | 'desc';
  query?: (query: Query) => Query;
  /**
   * Whether to fetch the "raw" version of the doc (for use in conjunction with
   * `setRawDoc()`).
   */
  raw?: boolean;
}

export interface GetCountOptions {
  mode: DocMode;
  query?: (query: Query) => Query;
}

export interface Translation {
  [locale: string]: string;
  source: string;
}

export interface TranslationsMap {
  [hash: string]: Translation;
}

export interface LocaleTranslations {
  [source: string]: string;
}

export interface LoadTranslationsOptions {
  tags?: string[];
}

export interface Release {
  id: string;
  description?: string;
  docIds?: string[];
  dataSourceIds?: string[];
  createdAt?: Timestamp;
  createdBy?: string;
  scheduledAt?: Timestamp;
  scheduledBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

export interface Action<T = any> {
  /**
   * The name of the action.
   */
  action: string;
  /**
   * The user's email that performed the action (or "system").
   */
  by?: string;
  /**
   * Timestamp when the action occurred.
   */
  timestamp: Timestamp;
  /**
   * Metadata for the action.
   */
  metadata?: T;
  /**
   * Optional list of quick links to display in the UI.
   */
  links?: {label: string; url: string; target?: string}[];
}

export interface ListActionsOptions {
  /**
   * Filter by a specific action. Defaults to all actions.
   */
  action?: string;
  /**
   * Filter by a specific user. Defaults to all users.
   */
  by?: string;
  /**
   * Max number of actions to return. Defaults to 100.
   */
  limit?: number;
}

/**
 * Options for `RootCMSClient.sendEmail()`.
 *
 * Emails are queued in the `Projects/${projectId}/Emails` collection in
 * firestore and delivered by the Root.js email service (`apps/root-services`),
 * which sends pending emails using the App Engine Mail API.
 */
export interface SendEmailOptions {
  /** Recipient email address(es). */
  to: string | string[];
  /**
   * Sender email address. The sender must be authorized to send email via the
   * App Engine Mail API, e.g. `noreply@<gcp-project-id>.appspotmail.com`.
   * Defaults to `noreply@<gcp-project-id>.appspotmail.com`.
   */
  from?: string;
  /** Subject line. */
  subject: string;
  /**
   * Plain-text body. When omitted, a plain-text body is derived from
   * `htmlBody`.
   */
  body?: string;
  /** Optional HTML body. */
  htmlBody?: string;
  /**
   * Optional expiration date. If the email is still unsent when the email
   * service processes the queue after this date (e.g. the service was down),
   * the email is marked as expired and skipped instead of being delivered
   * late.
   */
  expiresAt?: Date;
  /**
   * Email service used to trigger delivery immediately after the email is
   * queued. Setting this to `true` uses the default hosted service at
   * https://services.rootjs.dev. Set to a base URL to use a self-hosted
   * deployment of the service (`apps/root-services`). When unset, the email
   * remains queued until the email service's cron next processes the queue.
   */
  emailService?: string | boolean;
}

export class RootCMSClient {
  readonly rootConfig: RootConfig;
  readonly cmsPlugin: CMSPlugin;
  readonly projectId: string;
  readonly app: App;
  readonly db: Firestore;
  /** Memoized `customSorting` collection option, see `hasCustomSorting()`. */
  private _customSortingCache = new Map<string, boolean>();

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    this.cmsPlugin = getCmsPlugin(this.rootConfig);

    const cmsPluginOptions = this.cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.app = this.cmsPlugin.getFirebaseApp();
    this.db = this.cmsPlugin.getFirestore();
  }

  /**
   * Converts a doc mode to the Firestore collection name.
   */
  private getModeCollection(mode: DocMode): string {
    return mode === 'draft' ? 'Drafts' : 'Published';
  }

  /**
   * Retrieves doc data from Root.js CMS.
   */
  async getDoc<Fields = any>(
    collectionId: string,
    slug: string,
    options: GetDocOptions
  ): Promise<Doc<Fields> | null> {
    const rawData = await this.getRawDoc(collectionId, slug, options);
    if (rawData) {
      return unmarshalData(rawData) as Doc<Fields>;
    }
    return null;
  }

  /**
   * Retrieves raw doc data as stored in the database. Only use this if you know
   * what you are doing.
   */
  async getRawDoc(
    collectionId: string,
    slug: string,
    options: GetDocOptions
  ): Promise<any | null> {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }
    if (!slug) {
      throw new Error('slug is required');
    }

    const modeCollection = this.getModeCollection(options.mode);
    // Slugs with slashes are encoded as `--` in the DB.
    slug = normalizeSlug(slug);
    // Firestore limits document ids (the slug) to 1500 bytes. A slug that
    // exceeds this limit can never have been written, so short-circuit and
    // return null instead of issuing a request that would throw.
    if (Buffer.byteLength(slug, 'utf8') > FIRESTORE_DOC_ID_MAX_BYTES) {
      return null;
    }
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
    const docRef = this.db.doc(dbPath);
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  }

  /**
   * Firestore path for a collection.
   */
  dbCollectionDocsPath(
    collectionId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    let modeCollection: string;
    if (options.mode === 'draft') {
      modeCollection = 'Drafts';
    } else if (options.mode === 'published') {
      modeCollection = 'Published';
    } else {
      throw new Error(`unknown mode: ${options.mode}`);
    }
    return `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
  }

  /**
   * Firestore path for a content doc.
   */
  dbDocPath(
    collectionId: string,
    slug: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const collectionDocsPath = this.dbCollectionDocsPath(collectionId, options);
    // Slugs with slashes are encoded as `--` in the DB.
    const normalizedSlug = normalizeSlug(slug);
    return `${collectionDocsPath}/${normalizedSlug}`;
  }

  /**
   * Firestore doc ref for a content doc.
   */
  dbDocRef(
    collectionId: string,
    slug: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const docPath = this.dbDocPath(collectionId, slug, options);
    return this.db.doc(docPath);
  }

  /**
   * Returns a collection's schema definition as defined in
   * `/collections/<id>.schema.ts`.
   */
  async getCollection(collectionId: string): Promise<Collection | null> {
    // Lazy load the project module to minimize the amount of code loaded
    // when the client is initialized (the project module loads all schema files).
    const project = await import('./project.js');
    return await project.getCollectionSchema(collectionId);
  }

  /**
   * Returns whether a collection has the `customSorting` option enabled.
   * The result is memoized per collection since this is called on the
   * `listDocs()` hot path. Returns false when the collection schema cannot
   * be loaded (e.g. in standalone scripts outside the vite server).
   */
  private async hasCustomSorting(collectionId: string): Promise<boolean> {
    let customSorting = this._customSortingCache.get(collectionId);
    if (customSorting === undefined) {
      try {
        const collection = await this.getCollection(collectionId);
        customSorting = Boolean(collection?.customSorting);
      } catch {
        customSorting = false;
      }
      this._customSortingCache.set(collectionId, customSorting);
    }
    return customSorting;
  }

  /**
   * Saves draft data to a doc.
   *
   * Note: this saves data to the "fields" attr of the draft doc. If you need to
   * modify the sys-level attributes of the doc, use `setRawDoc()`.
   */
  async saveDraftData(
    docId: string,
    fieldsData: any,
    options?: SaveDraftOptions
  ) {
    const {collection, slug} = parseDocId(docId);

    // Validate fieldsData if requested.
    if (options?.validate) {
      const collectionSchema = await this.getCollection(collection);
      if (!collectionSchema) {
        throw new Error(
          `Collection schema not found for: ${collection}. Unable to validate.`
        );
      }
      const errors = validateFields(fieldsData, collectionSchema);
      if (errors.length > 0) {
        const errorMessages = errors
          .map((err) => `  - ${err.path}: ${err.message}`)
          .join('\n');
        throw new Error(`Validation failed for ${docId}:\n${errorMessages}`);
      }
    }

    const draftDoc =
      (await this.getRawDoc(collection, slug, {mode: 'draft'})) || {};
    const draftSys = draftDoc.sys || {};
    const modifiedBy = options?.modifiedBy || 'root-cms-client';
    const fields = marshalData(fieldsData || {});
    const data = {
      id: docId,
      collection,
      slug,
      sys: {
        ...draftSys,
        createdAt: draftSys.createdAt ?? Timestamp.now(),
        createdBy: draftSys.createdBy ?? modifiedBy,
        modifiedAt: Timestamp.now(),
        modifiedBy,
        locales: options?.locales ?? draftSys.locales ?? ['en'],
      },
      fields,
    };
    await this.setRawDoc(collection, slug, data, {mode: 'draft'});
  }

  /**
   * Updates a specific field path in a draft doc.
   *
   * This allows partial updates to nested fields without replacing the entire document.
   * For example: `updateDraftData('Pages/home', 'hero.title', 'New Title')`
   *
   * @param docId - The document ID (e.g., 'Pages/home')
   * @param path - JSON path to the field (e.g., 'hero.title' or 'content.0.text')
   * @param fieldValue - The value to set at the specified path
   * @param options - Update options including validation
   */
  async updateDraftData(
    docId: string,
    path: string,
    fieldValue: any,
    options?: UpdateDraftOptions
  ) {
    const {collection, slug} = parseDocId(docId);

    // Get current draft doc.
    const draftDoc =
      (await this.getRawDoc(collection, slug, {mode: 'draft'})) || {};
    const fieldsData = unmarshalData(draftDoc.fields || {});

    // Set the value at the specified path.
    setValueAtPath(fieldsData, path, fieldValue);

    // Save the updated document using saveDraftData.
    await this.saveDraftData(docId, fieldsData, {
      validate: options?.validate,
    });
  }

  /**
   * Sets the raw document data directly in Firestore.
   *
   * CAUTION Prefer using `saveDraftData('Pages/foo', data)` in most cases.
   * Only use this method if you need to manipulate system-level (sys) fields
   * directly or if you're implementing low-level data operations.
   *
   * ## Validation & Normalization
   *
   * This method automatically validates and normalizes `sys` fields to prevent
   * data integrity issues that can cause runtime errors like
   * "e.toMillis is not a function".
   *
   * ### Timestamp Fields (auto-converted)
   * The following fields accept multiple formats and are automatically converted
   * to Firestore Timestamp objects:
   * - `sys.createdAt`
   * - `sys.modifiedAt`
   * - `sys.publishedAt`
   * - `sys.firstPublishedAt`
   *
   * Accepted formats:
   * - Firestore `Timestamp` object (unchanged)
   * - `number` - Interpreted as milliseconds since epoch, converted to Timestamp
   * - `Date` object - Converted to Timestamp
   *
   * ### Required Fields (auto-populated with defaults if missing)
   * - `sys.createdAt` - Defaults to current time if not provided
   * - `sys.modifiedAt` - Defaults to current time if not provided
   * - `sys.createdBy` - Defaults to 'root-cms-client' if not provided
   * - `sys.modifiedBy` - Defaults to 'root-cms-client' if not provided
   * - `sys.locales` - Defaults to ['en'] if not provided
   *
   * ### Optional Fields (validated if present)
   * - `sys.publishedBy` - String identifier
   * - `sys.firstPublishedBy` - String identifier
   * - `sys.publishingLocked` - Object with optional `until` Timestamp
   *
   * ### Document Identity
   * The `id`, `collection`, and `slug` fields are always set to match the
   * provided parameters, overwriting any existing values to prevent data
   * inconsistencies.
   *
   * @param collectionId - The collection ID (e.g., 'Pages')
   * @param slug - The document slug (e.g., 'home')
   * @param data - The complete document data including sys and fields
   * @param options - Options specifying mode ('draft' or 'published')
   *
   * @throws {Error} If sys fields are invalid or missing required fields
   * @throws {Error} If timestamp fields have invalid types
   *
   * @example
   * ```typescript
   * // Minimal example - sys fields use defaults
   * await client.setRawDoc('Pages', 'home', {
   *   sys: {},  // All sys fields will be auto-populated with defaults
   *   fields: {
   *     title: 'Home Page'
   *   }
   * }, { mode: 'draft' });
   *
   * // Full example - with number timestamps (auto-converted)
   * await client.setRawDoc('Pages', 'home', {
   *   id: 'Pages/home',
   *   collection: 'Pages',
   *   slug: 'home',
   *   sys: {
   *     createdAt: Date.now(),  // Auto-converted to Timestamp.
   *     createdBy: 'user@example.com',
   *     modifiedAt: Date.now(),  // Auto-converted to Timestamp.
   *     modifiedBy: 'user@example.com',
   *     locales: ['en', 'es']
   *   },
   *   fields: {
   *     title: 'Home Page'
   *   }
   * }, { mode: 'draft' });
   * ```
   */
  async setRawDoc(
    collectionId: string,
    slug: string,
    data: any,
    options: SetDocOptions
  ) {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }
    if (!slug) {
      throw new Error('slug is required');
    }

    // Slugs with slashes are encoded as `--` in the DB.
    slug = normalizeSlug(slug);

    // Ensure id, collection, and slug fields match the parameters to prevent data inconsistencies.
    const expectedId = `${collectionId}/${slug}`;
    data.id = expectedId;
    data.collection = collectionId;
    data.slug = slug;

    // Validate and normalize sys fields to prevent data integrity issues.
    data.sys = validateSysFields(data.sys || {});

    const modeCollection = this.getModeCollection(options.mode);
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
    const docRef = this.db.doc(dbPath);
    await docRef.set(data);
  }

  /**
   * Lists docs from a Root.js CMS collection.
   */
  async listDocs<T>(
    collectionId: string,
    options: ListDocsOptions
  ): Promise<{docs: T[]}> {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    const modeCollection = this.getModeCollection(options.mode);
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
    let query: Query = this.db.collection(dbPath);
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.offset(options.offset);
    }
    let orderBy = options.orderBy;
    // Collections with `customSorting` default to the custom order. The
    // default is skipped when a `query` fn is provided, since adding an
    // orderBy to a filtered query may require a composite index (and would
    // exclude docs that don't have a `sys.sortKey`).
    if (
      !orderBy &&
      !options.query &&
      (await this.hasCustomSorting(collectionId))
    ) {
      orderBy = 'sys.sortKey';
    }
    if (orderBy) {
      query = query.orderBy(orderBy, options.orderByDirection);
    }
    if (options.query) {
      query = options.query(query);
    }
    const results = await query.get();
    const docs: T[] = [];
    results.forEach((result) => {
      if (options.raw) {
        // For callers that wish to modify the raw doc via `setRawDoc()`,
        // return the unmodified doc as returned from firestore.
        const rawDoc = result.data() as T;
        docs.push(rawDoc);
      } else {
        const doc = unmarshalData(result.data()) as T;
        docs.push(doc);
      }
    });
    return {docs};
  }

  /**
   * Returns the number of docs in a Root.js CMS collection.
   */
  async getDocsCount(collectionId: string, options: GetCountOptions) {
    if (!collectionId) {
      throw new Error('collectionId is required');
    }

    const modeCollection = this.getModeCollection(options.mode);
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
    let query: Query = this.db.collection(dbPath);
    if (options.query) {
      query = options.query(query);
    }
    const results = await query.count().get();
    const count = results.data().count;
    return count;
  }

  /**
   * Batch publishes a set of docs by id.
   */
  async publishDocs(
    docIds: string[],
    options?: {publishedBy: string; batch?: WriteBatch; releaseId?: string}
  ) {
    const projectCollectionsPath = `Projects/${this.projectId}/Collections`;
    const publishedBy = options?.publishedBy || 'root-cms-client';

    // Fetch the current draft data for each doc.
    const docRefs = docIds.map((docId) => {
      const [collection, slug] = docId.split('/');
      if (!collection || !slug) {
        throw new Error(`invalid doc id: ${docId}`);
      }
      const docRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}`
      );
      return docRef;
    });
    const docSnapshots = await this.db.getAll(...docRefs);
    const docs = docSnapshots
      // Retrieve snapshot data for each doc.
      .map((snapshot) => snapshot.data() as Doc)
      // Remove docs that don't exist.
      .filter((d) => !!d);

    if (docs.length === 0) {
      console.log('no docs to publish');
      return [];
    }

    // Verify there are no publishing locks on any docs.
    for (const doc of docs) {
      if (this.testPublishingLocked(doc)) {
        throw new Error(`publishing is locked for doc: ${doc.id}`);
      }
    }

    // If the v2 translations manager is enabled, prefetch the draft
    // translations locale docs for each doc so that the doc's translations
    // are published in the same batch as the doc itself.
    let tm: TranslationsManager | null = null;
    let translationsByDocId: Record<string, TranslationsLocaleDocWithRef[]> =
      {};
    if (this.isV2TranslationsEnabled()) {
      tm = this.getTranslationsManager();
      translationsByDocId = await tm.getTranslationsLocaleDocs(
        docs.map((doc) => doc.id),
        'draft'
      );
    }

    // Each transaction or batch can write a max of 500 ops, so commit the
    // batch in chunks, starting a new batch after each commit.
    // https://firebase.google.com/docs/firestore/manage-data/transactions
    let batchCount = 0;
    let batch = options?.batch || this.db.batch();
    const versionTags = ['published'];
    if (options?.releaseId) {
      versionTags.push(`release:${options.releaseId}`);
    }
    const publishedDocs: any[] = [];
    for (const doc of docs) {
      const {id, collection, slug, sys, fields} = doc;
      const draftRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}`
      );
      const scheduledRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Scheduled/${slug}`
      );
      const publishedRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Published/${slug}`
      );

      // Only update `firstPublished` if it doesn't already exist.
      const firstPublishedAt =
        sys.firstPublishedAt ?? FieldValue.serverTimestamp();
      const firstPublishedBy = sys.firstPublishedBy ?? publishedBy;

      // Save published doc.
      batch.set(publishedRef, {
        id,
        collection,
        slug,
        fields: fields || {},
        sys: {
          ...sys,
          firstPublishedAt: firstPublishedAt,
          firstPublishedBy: firstPublishedBy,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: publishedBy,
        },
      });
      batchCount += 1;

      // Save a version snapshot of the published doc.
      const versionRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}/Versions/${Date.now()}`
      );
      const versionData: any = {
        id,
        collection,
        slug,
        fields: fields || {},
        sys: {
          ...sys,
          firstPublishedAt: firstPublishedAt,
          firstPublishedBy: firstPublishedBy,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: publishedBy,
        },
      };
      if (versionTags.length) {
        versionData.tags = versionTags;
      }
      batch.set(versionRef, versionData);
      batchCount += 1;

      // Remove scheduled doc, if any.
      batch.delete(scheduledRef);
      batchCount += 1;

      // Update the draft doc to remove `scheduledAt` and `scheduledBy` fields
      // and update the `publishedAt` and `publishedBy` fields.
      batch.update(draftRef, {
        'sys.scheduledAt': FieldValue.delete(),
        'sys.scheduledBy': FieldValue.delete(),
        'sys.firstPublishedAt': firstPublishedAt,
        'sys.firstPublishedBy': firstPublishedBy,
        'sys.publishedAt': FieldValue.serverTimestamp(),
        'sys.publishedBy': publishedBy,
      });
      batchCount += 1;

      // Publish the doc's translations within the same batch so the doc and
      // its translations go live atomically.
      if (tm) {
        const localeDocs = translationsByDocId[id] || [];
        batchCount += tm.addPublishTranslationsOps(localeDocs, batch, {
          publishedBy,
        });
      }

      publishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
        batch = this.db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    console.log(`published ${publishedDocs.length} docs!`);
    return publishedDocs;
  }

  /**
   * Batch unpublishes a set of docs by id.
   */
  async unpublishDocs(
    docIds: string[],
    options?: {unpublishedBy?: string; batch?: WriteBatch}
  ) {
    const projectCollectionsPath = `Projects/${this.projectId}/Collections`;
    const unpublishedBy = options?.unpublishedBy || 'root-cms-client';

    // Fetch the current draft data for each doc.
    const docRefs = docIds.map((docId) => {
      const [collection, slug] = docId.split('/');
      if (!collection || !slug) {
        throw new Error(`invalid doc id: ${docId}`);
      }
      const docRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}`
      );
      return docRef;
    });
    const docSnapshots = await this.db.getAll(...docRefs);
    const docs = docSnapshots
      // Retrieve snapshot data for each doc.
      .map((snapshot) => snapshot.data() as Doc)
      // Remove docs that don't exist.
      .filter((d) => !!d);

    if (docs.length === 0) {
      console.log('no docs to unpublish');
      return [];
    }

    // If the v2 translations manager is enabled, unpublish each doc's
    // translations along with the doc.
    let draftTranslationsByDocId: Record<
      string,
      TranslationsLocaleDocWithRef[]
    > = {};
    let publishedTranslationsByDocId: Record<
      string,
      TranslationsLocaleDocWithRef[]
    > = {};
    const v2TranslationsEnabled = this.isV2TranslationsEnabled();
    if (v2TranslationsEnabled) {
      const tm = this.getTranslationsManager();
      const docIdsToUnpublish = docs.map((doc) => doc.id);
      [draftTranslationsByDocId, publishedTranslationsByDocId] =
        await Promise.all([
          tm.getTranslationsLocaleDocs(docIdsToUnpublish, 'draft'),
          tm.getTranslationsLocaleDocs(docIdsToUnpublish, 'published'),
        ]);
    }

    let batchCount = 0;
    let batch = options?.batch || this.db.batch();
    const unpublishedDocs: any[] = [];

    for (const doc of docs) {
      const {collection, slug} = doc;
      const draftRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}`
      );
      const scheduledRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Scheduled/${slug}`
      );
      const publishedRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Published/${slug}`
      );

      // Update the draft doc to remove published fields.
      batch.update(draftRef, {
        'sys.modifiedAt': FieldValue.serverTimestamp(),
        'sys.modifiedBy': unpublishedBy,
        'sys.publishedAt': FieldValue.delete(),
        'sys.publishedBy': FieldValue.delete(),
        'sys.firstPublishedAt': FieldValue.delete(),
        'sys.firstPublishedBy': FieldValue.delete(),
      });
      batchCount += 1;

      // Delete the scheduled doc, if any.
      batch.delete(scheduledRef);
      batchCount += 1;

      // Delete the published doc.
      batch.delete(publishedRef);
      batchCount += 1;

      // Unpublish the doc's translations: delete the published locale docs
      // and clear the published metadata from the draft locale docs.
      if (v2TranslationsEnabled) {
        for (const localeDoc of publishedTranslationsByDocId[doc.id] || []) {
          batch.delete(localeDoc.ref);
          batchCount += 1;
        }
        for (const localeDoc of draftTranslationsByDocId[doc.id] || []) {
          batch.update(localeDoc.ref, {
            'sys.publishedAt': FieldValue.delete(),
            'sys.publishedBy': FieldValue.delete(),
          });
          batchCount += 1;
        }
      }

      unpublishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
        batch = this.db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    console.log(`unpublished ${unpublishedDocs.length} docs!`);
    return unpublishedDocs;
  }

  /**
   * Publishes scheduled docs.
   */
  async publishScheduledDocs() {
    const projectCollectionsPath = `Projects/${this.projectId}/Collections`;
    const now = Math.ceil(new Date().getTime());

    const snapshot = await this.db.collectionGroup('Scheduled').get();
    const docs = snapshot.docs
      .filter((d) => {
        // Filter docs by project.
        if (!d.ref.path.startsWith(projectCollectionsPath)) {
          return false;
        }
        // Filter docs where scheduledAt is in the past.
        // NOTE(stevenle): the filtering is done manually instead of using a query
        // to avoid having to create an index in firestore.
        const data = d.data() || {};
        const scheduledAt: Timestamp | undefined = data.sys?.scheduledAt;
        return (
          scheduledAt && scheduledAt.toMillis && scheduledAt.toMillis() <= now
        );
      })
      .map((d) => {
        const dbPath = d.ref.path;
        const segments = dbPath.split('/');
        const slug = segments.at(-1);
        const collection = segments.at(-3);
        const id = `${collection}/${slug}`;
        return {
          data: d.data(),
          id,
          collection,
          slug,
        };
      });

    if (docs.length === 0) {
      console.log('no docs to schedule');
      return [];
    }

    // If the v2 translations manager is enabled, prefetch the draft
    // translations locale docs for each doc so that the doc's translations
    // are published in the same batch as the doc itself.
    let tm: TranslationsManager | null = null;
    let translationsByDocId: Record<string, TranslationsLocaleDocWithRef[]> =
      {};
    if (this.isV2TranslationsEnabled()) {
      tm = this.getTranslationsManager();
      translationsByDocId = await tm.getTranslationsLocaleDocs(
        docs.map((doc) => doc.id),
        'draft'
      );
    }

    // Each transaction or batch can write a max of 500 ops, so commit the
    // batch in chunks, starting a new batch after each commit.
    // https://firebase.google.com/docs/firestore/manage-data/transactions
    let batchCount = 0;
    let batch = this.db.batch();
    const versionTags = ['published'];
    const publishedDocs: any[] = [];
    for (const doc of docs) {
      const {id, collection, slug, data} = doc;
      const draftRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}`
      );
      const scheduledRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Scheduled/${slug}`
      );
      const publishedRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Published/${slug}`
      );
      const {scheduledAt, scheduledBy, ...sys} = data.sys || {};

      // Only update `firstPublished` if it doesn't already exist.
      const firstPublishedAt = sys.firstPublishedAt ?? scheduledAt;
      const firstPublishedBy =
        sys.firstPublishedBy ?? (scheduledBy || 'root-cms-client');

      // Save published doc.
      batch.set(publishedRef, {
        id,
        collection,
        slug,
        fields: data.fields || {},
        sys: {
          ...sys,
          firstPublishedAt: firstPublishedAt,
          firstPublishedBy: firstPublishedBy,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: scheduledBy || '',
        },
      });
      batchCount += 1;

      // Save a version snapshot of the published doc.
      const versionRef = this.db.doc(
        `${projectCollectionsPath}/${collection}/Drafts/${slug}/Versions/${Date.now()}`
      );
      const versionData: any = {
        id,
        collection,
        slug,
        fields: data.fields || {},
        sys: {
          ...sys,
          firstPublishedAt: firstPublishedAt,
          firstPublishedBy: firstPublishedBy,
          publishedAt: FieldValue.serverTimestamp(),
          publishedBy: scheduledBy || '',
        },
        tags: versionTags,
      };
      if (data.scheduledPublishMessage) {
        versionData.publishMessage = data.scheduledPublishMessage;
      }
      batch.set(versionRef, versionData);
      batchCount += 1;

      // Remove published doc.
      batch.delete(scheduledRef);
      batchCount += 1;

      // Update the draft doc to remove `scheduledAt` and `scheduledBy` fields
      // and update the `publishedAt` and `publishedBy` fields.
      batch.update(draftRef, {
        'sys.scheduledAt': FieldValue.delete(),
        'sys.scheduledBy': FieldValue.delete(),
        'sys.firstPublishedAt': firstPublishedAt,
        'sys.firstPublishedBy': firstPublishedBy,
        'sys.publishedAt': FieldValue.serverTimestamp(),
        'sys.publishedBy': scheduledBy || 'root-cms-client',
      });
      batchCount += 1;

      // Publish the doc's translations within the same batch so the doc and
      // its translations go live atomically.
      if (tm) {
        const localeDocs = translationsByDocId[id] || [];
        batchCount += tm.addPublishTranslationsOps(localeDocs, batch, {
          publishedBy: scheduledBy || 'root-cms-client',
        });
      }

      publishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
        batch = this.db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    console.log(`published ${publishedDocs.length} docs!`);

    // Log an action for each published doc.
    for (const doc of publishedDocs) {
      const scheduledBy = doc.data?.sys?.scheduledBy || 'system';
      await this.logAction('doc.scheduled_publish', {
        by: scheduledBy,
        metadata: {docId: doc.id},
      });
    }

    return publishedDocs;
  }

  /**
   * Publishes docs in scheduled releases.
   */
  async publishScheduledReleases() {
    const releasesPath = `Projects/${this.projectId}/Releases`;
    const now = Math.ceil(new Date().getTime());
    const query: Query = this.db
      .collection(releasesPath)
      .where('scheduledAt', '<=', Timestamp.fromMillis(now));
    const querySnapshot = await query.get();

    for (const snapshot of querySnapshot.docs) {
      const release = snapshot.data() as Release;
      const publishedBy = release.scheduledBy || 'root-cms-client';
      const dataSourceIds = release.dataSourceIds || [];
      if (dataSourceIds.length > 0) {
        await this.publishDataSources(dataSourceIds, {publishedBy});
      }
      const docIds = release.docIds || [];
      if (docIds.length > 0) {
        await this.publishDocs(docIds, {
          publishedBy,
          releaseId: release.id,
        });
      }

      // Mark the release as published only after the doc and data source
      // writes above have been committed. If any of those writes fails, the
      // release remains scheduled and publishing is retried on the next run.
      await snapshot.ref.update({
        publishedAt: Timestamp.now(),
        publishedBy: publishedBy,
        scheduledAt: FieldValue.delete(),
        scheduledBy: FieldValue.delete(),
      });

      // Log an action for the published release.
      await this.logAction('release.scheduled_publish', {
        by: publishedBy,
        metadata: {
          releaseId: release.id,
          docIds: release.docIds || [],
          dataSourceIds: release.dataSourceIds || [],
        },
      });
    }
  }

  /**
   * Syncs data sources that have cron scheduling enabled and are due for sync.
   */
  async syncScheduledDataSources() {
    const dataSourcesPath = `Projects/${this.projectId}/DataSources`;
    const query: Query = this.db
      .collection(dataSourcesPath)
      .where('cron.enabled', '==', true);
    const querySnapshot = await query.get();
    const now = Date.now();

    for (const snapshot of querySnapshot.docs) {
      const dataSource = snapshot.data() as DataSource;
      const cron = dataSource.cron;
      if (!cron || !cron.enabled) {
        continue;
      }

      const lastSyncMs = dataSource.syncedAt
        ? dataSource.syncedAt.toMillis()
        : 0;

      // Determine whether the data source is due for sync based on its
      // schedule. `interval` (the default for legacy sources) syncs every N
      // units of time; the other modes use a cron expression.
      const schedule = cron.schedule || 'interval';
      let due: boolean;
      if (schedule === 'interval') {
        due = isIntervalDue(cron, lastSyncMs, now);
      } else {
        const expression = (cron.expression || '').trim();
        if (!expression) {
          continue;
        }
        try {
          due = isCronDue({
            expression: expression,
            timezone: cron.timezone,
            lastSyncMs: lastSyncMs,
            now: now,
          });
        } catch (err) {
          console.error(
            `cron: invalid cron expression for data source ${dataSource.id}: ` +
              `"${expression}":`,
            String(err)
          );
          continue;
        }
      }
      if (!due) {
        continue;
      }

      try {
        console.log(`cron: syncing data source: ${dataSource.id}`);
        await this.syncDataSource(dataSource.id, {syncedBy: 'cron'});

        if (cron.autoPublish) {
          console.log(`cron: auto-publishing data source: ${dataSource.id}`);
          await this.publishDataSource(dataSource.id, {
            publishedBy: 'cron',
          });
        }

        await this.logAction('datasource.cron_sync', {
          by: 'cron',
          metadata: {
            datasourceId: dataSource.id,
            autoPublish: cron.autoPublish || false,
          },
        });
      } catch (err) {
        console.error(
          `cron: failed to sync data source ${dataSource.id}:`,
          String(err)
        );
      }
    }
  }

  /**
   * Checks if a doc is currently "locked" for publishing.
   */
  testPublishingLocked(doc: Doc) {
    if (doc.sys?.publishingLocked) {
      if (doc.sys.publishingLocked.until) {
        const now = Timestamp.now().toMillis();
        const until = doc.sys.publishingLocked.until.toMillis();
        return now < until;
      }
      return true;
    }
    return false;
  }

  /**
   * Returns a `TranslationsManager` object for managing translations.
   *
   * To get translations:
   * ```
   * await tm.loadTranslations({
   *   ids: ['Global/strings', 'Pages/index'],
   *   locales: ['es'],
   * });
   * ```
   *
   * NOTE: The `TranslationsManager` is a v2 feature that will eventually
   * replace the v1 translations system.
   */
  getTranslationsManager(): TranslationsManager {
    if (!this.isV2TranslationsEnabled()) {
      throw new Error(
        '`v2TranslationsManager` is not enabled. update root.config.ts and add: `{experiments: {v2TranslationsManager: true}}`'
      );
    }
    return new TranslationsManager(this);
  }

  /**
   * Returns true if the v2 `TranslationsManager` is enabled via the
   * `experiments.v2TranslationsManager` plugin config flag.
   */
  isV2TranslationsEnabled(): boolean {
    const cmsPluginOptions = this.cmsPlugin.getConfig();
    return Boolean(cmsPluginOptions.experiments?.v2TranslationsManager);
  }

  /**
   * Loads translations saved in the translations collection, optionally
   * filtered by tag.
   *
   * Returns a map like:
   * ```
   * {
   *   "<hash>": {"source": "Hello", "es": "Hola", "fr": "Bonjour"},
   * }
   * ```
   */
  async loadTranslations(
    options?: LoadTranslationsOptions
  ): Promise<TranslationsMap> {
    const dbPath = `Projects/${this.projectId}/Translations`;
    let query: Query = this.db.collection(dbPath);
    if (options?.tags) {
      query = query.where('tags', 'array-contains-any', options.tags);
    }

    const querySnapshot = await query.get();
    const translationsMap: TranslationsMap = {};
    querySnapshot.forEach((doc) => {
      const hash = doc.id;
      translationsMap[hash] = doc.data() as Translation;
    });
    return translationsMap;
  }

  /**
   * Saves a map of translations, e.g.:
   * ```
   * await client.saveTranslations({
   *   "Hello": {"es": "Hola", "fr": "Bonjour"},
   * });
   * ```
   */
  async saveTranslations(
    translations: {
      [source: string]: {[locale: string]: string};
    },
    tags?: string[]
  ) {
    const translationsPath = `Projects/${this.projectId}/Translations`;
    const batch = this.db.batch();
    let batchCount = 0;
    Object.entries(translations).forEach(([source, sourceTranslations]) => {
      const hash = this.getTranslationKey(source);
      const translationRef = this.db.doc(`${translationsPath}/${hash}`);
      const data: any = {
        ...sourceTranslations,
        source: this.normalizeString(source),
      };
      if (tags) {
        // Use arrayUnion() to append tags to any existing values.
        data.tags = FieldValue.arrayUnion(...tags);
      }
      batch.set(translationRef, data, {merge: true});
      batchCount += 1;
    });
    if (batchCount > 500) {
      throw new Error('up to 500 translations can be saved at a time.');
    }
    await batch.commit();
  }

  /**
   * Returns the "key" used for a translation as stored in the db. Translations
   * are stored under `Projects/<project id>/Translations/<sha1 hash>`.
   */
  getTranslationKey(source: string) {
    const sha1 = crypto
      .createHash('sha1')
      .update(this.normalizeString(source))
      .digest('hex');
    return sha1;
  }

  /**
   * Cleans a string that's used for translations. Performs the following:
   * - Removes any leading/trailing whitespace
   * - Removes spaces at the end of any line
   */
  normalizeString(str: string) {
    const lines = String(str)
      .trim()
      .split('\n')
      .map((line) => line.trimEnd());
    return lines.join('\n');
  }

  /**
   * Loads translations for a particular locale.
   *
   * Returns a map like:
   * ```
   * {
   *   "Hello": "Bonjour",
   * }
   * ```
   */
  async loadTranslationsForLocale(
    locale: string,
    options?: LoadTranslationsOptions
  ): Promise<LocaleTranslations> {
    const translationsMap = await this.loadTranslations(options);
    return translationsForLocale(translationsMap, locale);
  }

  /**
   * Returns a data source configuration object.
   */
  async getDataSource(dataSourceId: string) {
    const dbPath = `Projects/${this.projectId}/DataSources/${dataSourceId}`;
    const docRef = this.db.doc(dbPath);
    const doc = await docRef.get();
    if (doc.exists) {
      const dataSource = doc.data() as DataSource;
      if (dataSource.archivedAt) {
        console.warn(
          `warning: data source "${dataSourceId}" is archived` +
            (dataSource.archivedBy
              ? ` (archived by ${dataSource.archivedBy})`
              : '')
        );
      }
      return dataSource;
    }
    return null;
  }

  /**
   * Archives a data source. Archived data sources cannot be synced or published.
   */
  async archiveDataSource(
    dataSourceId: string,
    options?: {archivedBy?: string}
  ) {
    const dbPath = `Projects/${this.projectId}/DataSources/${dataSourceId}`;
    const docRef = this.db.doc(dbPath);
    const archivedBy = options?.archivedBy || 'root-cms-client';
    await docRef.update({
      archivedAt: Timestamp.now(),
      archivedBy: archivedBy,
    });
    console.log(`archived data source: ${dataSourceId}`);
  }

  /**
   * Unarchives a data source.
   */
  async unarchiveDataSource(dataSourceId: string) {
    const dbPath = `Projects/${this.projectId}/DataSources/${dataSourceId}`;
    const docRef = this.db.doc(dbPath);
    await docRef.update({
      archivedAt: FieldValue.delete(),
      archivedBy: FieldValue.delete(),
    });
    console.log(`unarchived data source: ${dataSourceId}`);
  }

  /**
   * Syncs a data source to draft state.
   */
  async syncDataSource(dataSourceId: string, options?: {syncedBy?: string}) {
    const dataSource = await this.getDataSource(dataSourceId);
    if (!dataSource) {
      throw new Error(`data source not found: ${dataSourceId}`);
    }
    if (dataSource.archivedAt) {
      throw new Error(`data source is archived: ${dataSourceId}`);
    }

    const result = await this.fetchData(dataSource);

    const dataSourceDocRef = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}`
    );
    const dataDocRef = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}/Data/draft`
    );
    const syncedBy = options?.syncedBy || 'root-cms-client';

    const updatedDataSource: DataSource = {
      ...dataSource,
      syncedAt: Timestamp.now(),
      syncedBy: syncedBy,
    };

    const batch = this.db.batch();
    batch.set(dataDocRef, {
      dataSource: updatedDataSource,
      data: result.data,
      ...(result.headers ? {headers: result.headers} : {}),
    });
    batch.update(dataSourceDocRef, {
      syncedAt: Timestamp.now(),
      syncedBy: syncedBy,
    });
    await batch.commit();

    console.log(`synced data source: ${dataSourceId}`);
    console.log(`synced by: ${syncedBy}`);
  }

  async publishDataSource(
    dataSourceId: string,
    options?: {publishedBy?: string}
  ) {
    const dataSource = await this.getDataSource(dataSourceId);
    if (!dataSource) {
      throw new Error(`data source not found: ${dataSourceId}`);
    }
    if (dataSource.archivedAt) {
      throw new Error(`data source is archived: ${dataSourceId}`);
    }

    const dataSourceDocRef = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}`
    );
    const dataDocRefDraft = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}/draft`
    );
    const dataDocRefPublished = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}/published`
    );

    const dataRes = await this.getFromDataSource(dataSourceId, {mode: 'draft'});

    const publishedBy = options?.publishedBy || 'root-cms-client';

    const updatedDataSource: DataSource = {
      ...dataSource,
      publishedAt: Timestamp.now(),
      publishedBy: publishedBy,
    };

    const batch = this.db.batch();
    batch.set(dataDocRefPublished, {
      dataSource: updatedDataSource,
      data: dataRes?.data || null,
      ...(dataRes?.headers ? {headers: dataRes.headers} : {}),
    });
    batch.update(dataDocRefDraft, {
      dataSource: updatedDataSource,
    });
    batch.update(dataSourceDocRef, {
      publishedAt: Timestamp.now(),
      publishedBy: publishedBy,
    });
    await batch.commit();

    console.log(`published data ${dataSourceId}`);
    console.log(`published by: ${publishedBy}`);
  }

  /**
   * Unpublishes a data source. Removes the `publishedAt`/`publishedBy`
   * metadata from the DataSource doc and deletes the `Data/published` doc.
   */
  async unpublishDataSource(dataSourceId: string) {
    const dataSource = await this.getDataSource(dataSourceId);
    if (!dataSource) {
      throw new Error(`data source not found: ${dataSourceId}`);
    }

    const dataSourceDocRef = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}`
    );
    const dataDocRefDraft = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}/Data/draft`
    );
    const dataDocRefPublished = this.db.doc(
      `Projects/${this.projectId}/DataSources/${dataSourceId}/Data/published`
    );

    const batch = this.db.batch();
    batch.update(dataSourceDocRef, {
      publishedAt: FieldValue.delete(),
      publishedBy: FieldValue.delete(),
    });
    // Also remove the embedded `publishedAt`/`publishedBy` from the draft data
    // doc so it stays in sync.
    const draftSnapshot = await dataDocRefDraft.get();
    if (draftSnapshot.exists) {
      batch.update(dataDocRefDraft, {
        'dataSource.publishedAt': FieldValue.delete(),
        'dataSource.publishedBy': FieldValue.delete(),
      });
    }
    batch.delete(dataDocRefPublished);
    await batch.commit();

    console.log(`unpublished data source: ${dataSourceId}`);
  }

  async publishDataSources(
    dataSourceIds: string[],
    options?: {publishedBy: string; batch?: WriteBatch; commitBatch?: boolean}
  ) {
    const publishedBy = options?.publishedBy || 'root-cms-client';
    const batch = options?.batch || this.db.batch();
    for (const id of dataSourceIds) {
      const dataSource = await this.getDataSource(id);
      if (!dataSource) {
        throw new Error(`data source not found: ${id}`);
      }
      if (dataSource.archivedAt) {
        throw new Error(`data source is archived: ${id}`);
      }
      const dataSourceDocRef = this.db.doc(
        `Projects/${this.projectId}/DataSources/${id}`
      );
      const dataDocRefDraft = this.db.doc(
        `Projects/${this.projectId}/DataSources/${id}/draft`
      );
      const dataDocRefPublished = this.db.doc(
        `Projects/${this.projectId}/DataSources/${id}/published`
      );
      const dataRes = await this.getFromDataSource(id, {mode: 'draft'});
      const updatedDataSource = {
        ...dataSource,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy,
      };
      batch.set(dataDocRefPublished, {
        dataSource: updatedDataSource,
        data: dataRes?.data || null,
        ...(dataRes?.headers ? {headers: dataRes.headers} : {}),
      });
      batch.update(dataDocRefDraft, {dataSource: updatedDataSource});
      batch.update(dataSourceDocRef, {
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy,
      });
    }
    if (!options?.batch || options?.commitBatch) {
      await batch.commit();
    }
  }

  private async fetchData(
    dataSource: DataSource
  ): Promise<{data: any; headers?: string[]}> {
    if (dataSource.type === 'http') {
      return {data: await this.fetchHttpData(dataSource)};
    }
    if (dataSource.type === 'gsheet') {
      return await this.fetchGsheetData(dataSource);
    }
    throw new Error(`unsupported data source: ${dataSource.type}`);
  }

  private async fetchHttpData(dataSource: DataSource) {
    const url = dataSource.url || '';
    if (!url.startsWith('https://')) {
      throw new Error(`url not supported: ${url}`);
    }

    const res = await fetch(url, {
      method: dataSource.httpOptions?.method || 'GET',
      headers: dataSource.httpOptions?.headers || [],
      body: dataSource.httpOptions?.body || undefined,
    });

    if (res.status !== 200) {
      const err = await res.text();
      throw new Error(`req failed: ${err}`);
    }

    const contentType = String(res.headers.get('content-type'));
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return res.text();
  }

  /**
   * Fetches data from a Google Sheet using the Google Sheets API v4.
   *
   * ## Setup
   *
   * For the server-side service account to access the Google Sheet:
   *
   * 1. **Enable the Google Sheets API** in the Google Cloud Console for the
   *    project associated with the service account.
   *    https://console.cloud.google.com/apis/library/sheets.googleapis.com
   *
   * 2. **Share the Google Sheet** with the service account's email address
   *    (e.g. `my-service-account@my-project.iam.gserviceaccount.com`).
   *    Open the sheet in Google Sheets, click "Share", and add the service
   *    account email as a Viewer.
   *
   *    - For **App Engine**: the service account email is typically
   *      `<project-id>@appspot.gserviceaccount.com`.
   *    - For **Cloud Run**: check the service account configured for the
   *      Cloud Run service in the Google Cloud Console.
   *    - For **local development**: use the service account email from the
   *      JSON key file specified in `GOOGLE_APPLICATION_CREDENTIALS`.
   */
  private async fetchGsheetData(
    dataSource: DataSource
  ): Promise<{data: any; headers?: string[]}> {
    const gsheetId = parseSpreadsheetUrl(dataSource.url);
    if (!gsheetId?.spreadsheetId) {
      throw new Error(`failed to parse google sheet url: ${dataSource.url}`);
    }

    const credential = this.app.options.credential;
    if (!credential) {
      throw new Error(
        'firebase credential not available. ensure the firebase admin app is initialized with a service account.'
      );
    }
    const {access_token} = await credential.getAccessToken();

    // Resolve the gid to a sheet title by fetching spreadsheet metadata.
    let sheetTitle = 'Sheet1';
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      gsheetId.spreadsheetId
    )}?fields=sheets.properties`;
    const metaRes = await fetch(metaUrl, {
      headers: {Authorization: `Bearer ${access_token}`},
    });
    if (metaRes.status !== 200) {
      const err = await metaRes.text();
      throw new Error(`failed to fetch spreadsheet metadata: ${err}`);
    }
    const meta = (await metaRes.json()) as {
      sheets?: {properties?: {sheetId?: number; title?: string}}[];
    };
    const sheets = meta.sheets || [];
    if (gsheetId.gid !== undefined) {
      const sheet = sheets.find((s) => s.properties?.sheetId === gsheetId.gid);
      if (sheet?.properties?.title) {
        sheetTitle = sheet.properties.title;
      } else if (gsheetId.gid !== 0) {
        throw new Error(
          `sheet with gid ${gsheetId.gid} not found in spreadsheet`
        );
      }
    }

    // Fetch all values from the sheet.
    const range = encodeURIComponent(sheetTitle);
    const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      gsheetId.spreadsheetId
    )}/values/${range}`;
    const valuesRes = await fetch(valuesUrl, {
      headers: {Authorization: `Bearer ${access_token}`},
    });
    if (valuesRes.status !== 200) {
      const err = await valuesRes.text();
      throw new Error(`failed to fetch sheet values: ${err}`);
    }
    const valuesData = (await valuesRes.json()) as {values?: string[][]};
    const values: string[][] = valuesData.values || [];
    if (values.length === 0) {
      return {data: [], headers: []};
    }

    const headers = values[0];
    const rows = values.slice(1);

    const dataFormat = dataSource.dataFormat || 'map';
    if (dataFormat === 'array') {
      return {data: [headers, ...rows], headers};
    }

    // Convert rows to an array of objects keyed by column headers.
    const mapData = rows.map((row) => {
      const item: Record<string, string> = {};
      row.forEach((val, i) => {
        const key = headers[i];
        if (key) {
          item[key] = String(val || '');
        }
      });
      return item;
    });
    return {data: mapData, headers};
  }

  /**
   * Fetches data from a data source.
   */
  async getFromDataSource<T = any>(
    dataSourceId: string,
    options?: {mode?: 'draft' | 'published'}
  ): Promise<DataSourceData<T> | null> {
    const mode = options?.mode || 'published';
    if (!(mode === 'draft' || mode === 'published')) {
      throw new Error(`invalid mode: ${mode}`);
    }
    if (!dataSourceId || dataSourceId.includes('/')) {
      throw new Error(`invalid data source id: ${dataSourceId}`);
    }

    const docRef = this.dbDataSourceDataRef(dataSourceId, {mode});
    const doc = await docRef.get();
    if (doc.exists) {
      const dataSourceData = doc.data() as DataSourceData<T>;
      if (dataSourceData.dataSource?.archivedAt) {
        const archivedBy = dataSourceData.dataSource.archivedBy;
        console.warn(
          `warning: data source "${dataSourceId}" is archived` +
            (archivedBy ? ` (archived by ${archivedBy})` : '')
        );
      }
      return dataSourceData;
    }
    return null;
  }

  /**
   * Firestore path for a datasource data.
   */
  dbDataSourceDataPath(
    dataSourceId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    if (!dataSourceId || dataSourceId.includes('/')) {
      throw new Error(`invalid data source id: ${dataSourceId}`);
    }
    const mode = options.mode;
    if (!(mode === 'draft' || mode === 'published')) {
      throw new Error(`invalid mode: ${mode}`);
    }
    const dbPath = `Projects/${this.projectId}/DataSources/${dataSourceId}/Data/${mode}`;
    return dbPath;
  }

  /**
   * Firestore doc ref for a datasource data.
   */
  dbDataSourceDataRef(
    dataSourceId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const dbPath = this.dbDataSourceDataPath(dataSourceId, options);
    return this.db.doc(dbPath);
  }

  /**
   * Looks up the user's entry in the project's ACL with a single Firestore
   * read. `exists` is `true` if the user (or their domain's wildcard entry,
   * e.g. `*@example.com`) is in the ACL; `role` may be `null` for entries
   * without an assigned role.
   */
  async getUserAcl(
    email: string
  ): Promise<{exists: boolean; role: UserRole | null}> {
    if (!email) {
      return {exists: false, role: null};
    }
    const docRef = this.db.doc(`Projects/${this.projectId}`);
    const snapshot = await docRef.get();
    const data = snapshot.data() || {};
    const acl = data.roles || {};

    if (email in acl) {
      return {exists: true, role: acl[email] ?? null};
    }

    // Check wildcard domains, e.g. `*@example.com`.
    if (!email.includes('@')) {
      console.warn(`invalid email: ${email}`);
      return {exists: false, role: null};
    }
    const domain = email.split('@').at(-1);
    const wildcard = `*@${domain}`;
    if (domain && wildcard in acl) {
      return {exists: true, role: acl[wildcard] ?? null};
    }
    return {exists: false, role: null};
  }

  /**
   * Gets the user's role from the project's ACL.
   */
  async getUserRole(email: string): Promise<UserRole | null> {
    const acl = await this.getUserAcl(email);
    return acl.role;
  }

  /**
   * Verifies user exists in the ACL list.
   */
  async userExistsInAcl(email: string): Promise<boolean> {
    const acl = await this.getUserAcl(email);
    return acl.exists;
  }

  /**
   * Lists action logs from the database.
   */
  async listActions(options?: ListActionsOptions): Promise<Action[]> {
    const colPath = `Projects/${this.projectId}/ActionLogs`;
    let queryRef: Query = this.db
      .collection(colPath)
      .orderBy('timestamp', 'desc');

    if (options?.action) {
      queryRef = queryRef.where('action', '==', options.action);
    }
    if (options?.by) {
      queryRef = queryRef.where('by', '==', options.by);
    }

    const limit = options?.limit ?? 100;
    queryRef = queryRef.limit(limit);

    const snapshot = await queryRef.get();
    return snapshot.docs.map((doc) => doc.data() as Action);
  }

  async logAction(
    action: string,
    options?: {
      by?: string;
      metadata?: any;
      links?: {label: string; url: string; target?: string}[];
    }
  ) {
    if (!action) {
      throw new Error('missing required: "action"');
    }
    const data: Action = {
      action: action,
      timestamp: Timestamp.now(),
      by: options?.by || 'system',
      metadata: options?.metadata || {},
    };
    if (options?.links) {
      data.links = options.links;
    }
    const colRef = this.db.collection(`Projects/${this.projectId}/ActionLogs`);
    await colRef.add(data);

    const metaStr = options?.metadata ? stringifyObj(options.metadata) : '';
    console.log(`[${data.timestamp.toMillis()}] action: ${action} ${metaStr}`);

    // Call the `onAction()` callback from cmsPlugin().
    const cmsPluginConfig = this.cmsPlugin.getConfig();
    if (cmsPluginConfig.onAction) {
      try {
        cmsPluginConfig.onAction(data);
      } catch (err) {
        console.error(err);
      }
    }

    // Dispatch to notification services' `onAction` hooks.
    const notifications = cmsPluginConfig.notifications;
    if (notifications && notifications.length > 0) {
      const ctx = {
        rootConfig: this.rootConfig,
        cmsClient: this,
        user: data.by ? {email: data.by} : undefined,
      };
      for (const service of notifications) {
        if (!service.onAction) {
          continue;
        }
        try {
          await service.onAction(ctx, data);
        } catch (err) {
          console.error(
            `notification service "${service.id}" onAction failed:`,
            err
          );
        }
      }
    }
  }

  /**
   * Queues an email in the `Projects/${projectId}/Emails` collection in
   * firestore, which is processed by the Root.js email service
   * (`apps/root-services`). Returns the id of the queued email doc.
   *
   * Delivery is asynchronous: the email service sends pending emails when its
   * `/_/send_emails` endpoint is called (typically via a cron). Pass the
   * `emailService` option to notify the service right away.
   */
  async sendEmail(options: SendEmailOptions): Promise<string> {
    const to = Array.isArray(options.to) ? options.to : [options.to];
    const recipients = to.map((email) => String(email).trim()).filter(Boolean);
    if (recipients.length === 0) {
      throw new Error('missing required: "to"');
    }
    if (!options.subject) {
      throw new Error('missing required: "subject"');
    }
    const gcpProjectId = this.cmsPlugin.getConfig().firebaseConfig.projectId;
    const email: Record<string, any> = {
      status: 'pending',
      createdAt: Timestamp.now(),
      from: options.from || `noreply@${gcpProjectId}.appspotmail.com`,
      to: recipients,
      subject: options.subject,
      // The email service always reads the `body` field, so fall back to a
      // plain-text version of the html body when no body is provided.
      body: options.body ?? htmlToPlainText(options.htmlBody || ''),
    };
    if (options.htmlBody) {
      email.htmlBody = options.htmlBody;
    }
    if (options.expiresAt) {
      email.expiredAt = Timestamp.fromDate(options.expiresAt);
    }
    const colRef = this.db.collection(`Projects/${this.projectId}/Emails`);
    const docRef = await colRef.add(email);
    if (options.emailService) {
      this.notifyEmailService(options.emailService);
    }
    return docRef.id;
  }

  /**
   * Notifies the email service that pending emails are ready for delivery.
   * Fire-and-forget: queued emails are eventually delivered when the email
   * service's cron next runs, even if this request fails.
   */
  private notifyEmailService(emailService: string | boolean) {
    const baseUrl =
      typeof emailService === 'string'
        ? emailService.replace(/\/+$/, '')
        : DEFAULT_EMAIL_SERVICE_URL;
    const params = new URLSearchParams({projectId: this.projectId});
    const url = `${baseUrl}/_/send_emails?${params.toString()}`;
    fetch(url, {signal: AbortSignal.timeout(EMAIL_SERVICE_TIMEOUT_MS)})
      .then(async (res) => {
        if (res.status !== 200) {
          const err = await res.text();
          console.error(`email service returned ${res.status}: ${err}`);
        }
      })
      .catch((err) => {
        console.error('failed to notify the email service:', err);
      });
  }

  /**
   * Returns the dependency graph for a given mode, which tracks reference
   * field usages between docs. Requires the `dependencyGraph` option to be
   * enabled on the cmsPlugin config (the graph is kept up to date by the CMS
   * cron job).
   *
   * Example:
   * ```ts
   * const graph = await cmsClient.getDependencyGraph({mode: 'published'});
   * const depIds = graph.getDependencies(['Pages/index']);
   * // => ['Authors/alice', 'BlogPosts/hello-world', ...]
   * ```
   */
  async getDependencyGraph(options: {mode: DocMode}): Promise<DependencyGraph> {
    // Lazy load the dependency graph module to minimize the amount of code
    // loaded when the client is initialized.
    const {DependencyGraphService} = await import('./dependency-graph.js');
    const service = new DependencyGraphService(this.rootConfig);
    return service.getGraph(options.mode);
  }

  /**
   * Returns the ids of the docs referenced by the given doc(s), i.e. the
   * additional docs that need to be fetched when fetching the given docs.
   * Dependencies are resolved transitively by default (pass
   * `transitive: false` for direct references only).
   *
   * Requires the `dependencyGraph` option to be enabled on the cmsPlugin
   * config.
   *
   * Example:
   * ```ts
   * const depIds = await cmsClient.getDocDependencies(['Pages/index'], {
   *   mode: 'published',
   * });
   * const req = cmsClient.createBatchRequest({mode: 'published'});
   * req.addDoc('Pages/index');
   * depIds.forEach((docId) => req.addDoc(docId));
   * const res = await req.fetch();
   * ```
   */
  async getDocDependencies(
    docIds: string | string[],
    options: {mode: DocMode; transitive?: boolean}
  ): Promise<string[]> {
    const graph = await this.getDependencyGraph({mode: options.mode});
    return graph.getDependencies(docIds, {transitive: options.transitive});
  }

  /**
   * Creates a batch request that is capable of fetching one or more docs,
   * corresponding translations, and dataSources.
   */
  createBatchRequest(options: BatchRequestOptions): BatchRequest {
    return new BatchRequest(this, options);
  }
}

/**
 * Returns true if the `data` is a rich text data object.
 */
export function isRichTextData(data: any) {
  // The RichTextEditor uses editorjs under the hood, the data format is
  // something like:
  //  {
  //   "time": 1721761211720,
  //   "version": "2.28.2",
  //   "blocks": [...]
  // }
  return Boolean(
    isObject(data) && Array.isArray(data.blocks) && data.time && data.version
  );
}

export function getCmsPlugin(rootConfig: RootConfig): CMSPlugin {
  const plugins: Plugin[] = rootConfig.plugins || [];
  const plugin = plugins.find((plugin) => plugin.name === 'root-cms');
  if (!plugin) {
    throw new Error('could not find root-cms plugin config in root.config.ts');
  }
  return plugin as CMSPlugin;
}

/**
 * Walks the data tree and converts any array of objects into "array objects"
 * for storage in firestore.
 */
export function marshalData(data: any): any {
  // Avoid changing the format of rich text data.
  if (isRichTextData(data)) {
    return data;
  }

  const result: any = {};
  for (const key in data) {
    const val = data[key];
    if (isObject(val)) {
      result[key] = marshalData(val);
    } else if (Array.isArray(val)) {
      if (val.length > 0 && val.some((item) => isObject(item))) {
        const items = val.map((item) => {
          if (isObject(item)) {
            return marshalData(item);
          }
          return item;
        });
        result[key] = toArrayObject(items);
      } else {
        result[key] = val;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Walks the data tree and converts any Timestamp objects to millis and any
 * _array maps to normal arrays.
 *
 * E.g.:
 *
 * normalizeData({
 *   sys: {modifiedAt: Timestamp(123)},
 *   fields: {
 *     _array: ['asdf'],
 *     asdf: {title: 'hello'}
 *   }
 * })
 * // => {sys: {modifiedAt: 123}, fields: {foo: [{title: 'hello'}]}}
 */
export function unmarshalData(data: any): any {
  const result: any = {};
  for (const key in data) {
    const val = data[key];
    if (isObject(val)) {
      if (val.toMillis) {
        result[key] = val.toMillis();
      } else if (Object.hasOwn(val, '_array') && Array.isArray(val._array)) {
        const arr = val._array.map((arrayKey: string) => {
          return {
            ...unmarshalData(val[arrayKey] || {}),
            _arrayKey: arrayKey,
          };
        });
        result[key] = arr;
      } else {
        result[key] = unmarshalData(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Checks if a value is defined (not undefined and not null).
 *
 * @param value - The value to check
 * @returns True if the value is defined, false otherwise
 */
function isDef(value: any): boolean {
  return value !== undefined && value !== null;
}

/**
 * Converts a value to a Firestore Timestamp.
 *
 * @param value - The value to convert (Timestamp, number, or Date)
 * @param fieldName - The name of the field (for error messages)
 * @returns A Firestore Timestamp object
 * @throws Error if the value cannot be converted to a Timestamp
 */
function convertToTimestamp(value: any, fieldName: string): Timestamp {
  // If it's already a Timestamp, return it.
  if (
    value &&
    typeof value === 'object' &&
    typeof value.toMillis === 'function'
  ) {
    return value;
  }
  // If it's a number (milliseconds), convert to Timestamp.
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  // If it's a Date, convert to Timestamp.
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  // Otherwise, it's invalid.
  throw new Error(
    `Invalid timestamp for ${fieldName}: expected Timestamp, number, or Date, got ${typeof value}`
  );
}

/**
 * Validates and normalizes sys fields to ensure data integrity.
 * Converts timestamp numbers to Firestore Timestamp objects and sets defaults for missing fields.
 * @throws Error if sys fields are invalid.
 */
function validateSysFields(sys: any): any {
  if (!sys || typeof sys !== 'object') {
    throw new Error('sys must be an object');
  }

  const result: any = {...sys};

  // Set default values for required timestamp fields if not provided.
  const now = Timestamp.now();
  if (isDef(result.createdAt)) {
    result.createdAt = convertToTimestamp(result.createdAt, 'sys.createdAt');
  } else {
    result.createdAt = now;
  }

  if (isDef(result.modifiedAt)) {
    result.modifiedAt = convertToTimestamp(result.modifiedAt, 'sys.modifiedAt');
  } else {
    result.modifiedAt = now;
  }

  // Validate and normalize optional timestamp fields.
  const optionalTimestampFields = ['firstPublishedAt', 'publishedAt'];
  for (const field of optionalTimestampFields) {
    if (isDef(sys[field])) {
      result[field] = convertToTimestamp(sys[field], `sys.${field}`);
    }
  }

  // Set default values for required string fields if not provided.
  if (!result.createdBy || typeof result.createdBy !== 'string') {
    result.createdBy = 'root-cms-client';
  }
  if (!result.modifiedBy || typeof result.modifiedBy !== 'string') {
    result.modifiedBy = 'root-cms-client';
  }

  // Validate optional string fields.
  const optionalStringFields = ['firstPublishedBy', 'publishedBy'];
  for (const field of optionalStringFields) {
    if (isDef(sys[field])) {
      if (typeof sys[field] !== 'string') {
        throw new Error(
          `Invalid sys.${field}: expected string, got ${typeof sys[field]}`
        );
      }
    }
  }

  // Validate publishingLocked if present.
  if (isDef(sys.publishingLocked)) {
    if (typeof sys.publishingLocked !== 'object') {
      throw new Error('Invalid sys.publishingLocked: expected object or null');
    }
    if (isDef(sys.publishingLocked.until)) {
      result.publishingLocked = {
        ...sys.publishingLocked,
        until: convertToTimestamp(
          sys.publishingLocked.until,
          'sys.publishingLocked.until'
        ),
      };
    }
  }

  // Set default locales if not provided.
  if (isDef(result.locales)) {
    if (!Array.isArray(result.locales)) {
      throw new Error('Invalid sys.locales: expected array');
    }
    if (!result.locales.every((locale: any) => typeof locale === 'string')) {
      throw new Error('Invalid sys.locales: all items must be strings');
    }
  } else {
    result.locales = ['en'];
  }

  return result;
}

/** @deprecated Use `unmarshalData()` instead. */
export function normalizeData(data: any): any {
  return unmarshalData(data);
}

export interface ArrayObject {
  [key: string]: any;
  _array: string[];
}

/**
 * Serializes an array into an `ArrayObject`, e.g.:
 *
 * ```
 * marshalArray([1, 2, 3])
 * // => {a: 1, b: 2, c: 3, _array: ['a', 'b', 'c']}
 * ```
 *
 * This database storage method makes it easier to update a single field in a
 * deeply nested array object.
 */
export function toArrayObject(arr: any[]): ArrayObject {
  if (!Array.isArray(arr)) {
    return arr;
  }
  const arrObject: ArrayObject = {_array: []};
  for (const item of arr) {
    const key = randString(6);
    arrObject[key] = item;
    arrObject._array.push(key);
  }
  return arrObject;
}

export const marshalArray = toArrayObject;

/**
 * Converts an `ArrayObject` to a normal array.
 */
export function unmarshalArray(arrObject: ArrayObject): any[] {
  if (!Array.isArray(arrObject?._array)) {
    return [];
  }
  const arr = arrObject._array.map((k: string) => arrObject[k]);
  return arr;
}

function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

/**
 * Returns true if an interval-scheduled data source is due for sync, i.e. at
 * least `interval` units of time have elapsed since the last sync.
 */
function isIntervalDue(
  cron: DataSourceCron,
  lastSyncMs: number,
  now: number
): boolean {
  // Normalize and validate the interval value.
  const interval = Number(cron.interval);
  if (
    !cron.unit ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    !Number.isInteger(interval)
  ) {
    return false;
  }

  // Calculate the interval in milliseconds.
  let intervalMs = interval;
  switch (cron.unit) {
    case 'minutes':
      intervalMs *= 60 * 1000;
      break;
    case 'hours':
      intervalMs *= 60 * 60 * 1000;
      break;
    case 'days':
      intervalMs *= 24 * 60 * 60 * 1000;
      break;
    default:
      return false;
  }

  // Guard against future syncedAt values (e.g., from skewed client clocks) so
  // that now - lastSyncMs does not become negative and block scheduling.
  const normalizedLastSyncMs = lastSyncMs > now ? now : lastSyncMs;
  return now - normalizedLastSyncMs >= intervalMs;
}

/**
 * Parses a Google Sheets URL and returns the spreadsheetId and gid.
 *
 * Expects a URL in the format:
 * `https://docs.google.com/spreadsheets/d/<spreadsheetId>/edit#gid=<gid>`
 */
function parseSpreadsheetUrl(
  url: string
): {spreadsheetId: string; gid: number} | null {
  if (!url.startsWith('https://docs.google.com/spreadsheets/d/')) {
    return null;
  }
  const parts = url.split('/');
  const dIndex = parts.indexOf('d');
  if (dIndex === -1 || dIndex + 1 >= parts.length) {
    return null;
  }
  const spreadsheetId = parts[dIndex + 1];
  if (!spreadsheetId) {
    return null;
  }
  let gid = 0;
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hash = url.slice(hashIndex);
    const gidMatch = hash.match(/gid=(\d+)/);
    if (gidMatch && gidMatch[1]) {
      gid = parseInt(gidMatch[1]);
    }
  }
  return {spreadsheetId, gid};
}

function randString(len: number): string {
  const result = [];
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) {
    const rand = Math.floor(Math.random() * chars.length);
    result.push(chars.charAt(rand));
  }
  return result.join('');
}

/**
 * Converts a translations map from `loadTranslations()` to a map of source to
 * translated string for a particular locale.
 *
 * Returns a map like:
 * ```
 * {
 *   "Hello": "Bonjour",
 * }
 * ```
 */
export function translationsForLocale(
  translationsMap: TranslationsMap,
  locale: string
) {
  const localeTranslations: LocaleTranslations = {};
  Object.values(translationsMap).forEach((string) => {
    const source = string.source;
    const translation = string[locale] || string.en || string.source;
    localeTranslations[source] = translation;
  });
  return localeTranslations;
}

/**
 * Converts an HTML string to a rough plain-text equivalent. Used as a
 * fallback for the plain-text body of emails that only provide an HTML body.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A pretty printer for JavaScript objects. */
function stringifyObj(obj: any) {
  function format(obj: any): string {
    if (obj === null) {
      return 'null';
    }
    if (typeof obj === 'undefined') {
      return 'undefined';
    }
    if (typeof obj === 'string') {
      return `"${obj.replaceAll('"', '\\"')}"`;
    }
    if (typeof obj !== 'object') {
      return String(obj);
    }
    if (Array.isArray(obj)) {
      return `[${obj.map(format).join(', ')}]`;
    }
    const entries: string[] = Object.entries(obj).map(([key, value]) => {
      return `${key}: ${format(value)}`;
    });
    return `{${entries.join(', ')}}`;
  }
  return format(obj);
}

/**
 * Parses a docId (e.g. `Pages/foo`) and returns the `collection` and `slug`.
 */
export function parseDocId(docId: string) {
  const sepIndex = docId.indexOf('/');
  if (sepIndex <= 0) {
    throw new Error(`invalid doc id: ${docId}`);
  }
  const collection = docId.slice(0, sepIndex);
  const slug = normalizeSlug(docId.slice(sepIndex + 1));
  if (!collection || !slug) {
    throw new Error(`invalid doc id: ${docId}`);
  }
  return {collection, slug};
}

export interface BatchRequestOptions {
  mode: 'draft' | 'published';
  /**
   * Whether to automatically fetch translations for the docs retrieved in the
   * request (including docs returned by queries).
   */
  translate?: boolean;
  /**
   * Locales to fetch translations for. Each locale is expanded through its
   * fallback chain (per the `i18n.fallbacks` config). Defaults to the locales
   * configured in `i18n.locales`.
   */
  locales?: string[];
}

export interface BatchRequestQuery {
  queryId: string;
  collectionId: string;
  queryOptions?: BatchRequestQueryOptions;
}

export interface BatchRequestQueryOptions {
  offset?: number;
  limit?: number;
  orderBy?: string;
  orderByDirection?: 'asc' | 'desc';
  query?: (query: Query) => Query;
}

export class BatchRequest {
  cmsClient: RootCMSClient;
  private options: BatchRequestOptions;
  private db: Firestore;
  private docIds: string[] = [];
  private dataSourceIds: string[] = [];
  private queries: BatchRequestQuery[] = [];
  private translationsIds: string[] = [];
  /**
   * Translations ids auto-collected from query results when
   * `options.translate` is enabled. Kept separate from the explicitly-added
   * ids so that the merge order is deterministic (generic translations first,
   * doc-specific translations last).
   */
  private queryTranslationsIds: string[] = [];
  /** Translations ids auto-collected from `addDoc()` docs. */
  private docTranslationsIds: string[] = [];

  constructor(cmsClient: RootCMSClient, options: BatchRequestOptions) {
    this.cmsClient = cmsClient;
    this.db = cmsClient.db;
    this.options = options;
  }

  /**
   * Adds a doc to the batch request.
   */
  addDoc(docId: string) {
    this.docIds.push(docId);
  }

  /**
   * Adds a data source to the batch request.
   */
  addDataSource(dataSourceId: string) {
    this.dataSourceIds.push(dataSourceId);
  }

  /**
   * Adds a collection-based query to the batch request.
   */
  addQuery(
    queryId: string,
    collectionId: string,
    queryOptions?: BatchRequestQueryOptions
  ) {
    this.queries.push({
      queryId: queryId,
      collectionId: collectionId,
      queryOptions: queryOptions,
    });
  }

  /**
   * Adds a translations doc to the request.
   */
  addTranslations(translationsId: string) {
    this.translationsIds.push(translationsId);
  }

  /**
   * Fetches data from the DB.
   */
  async fetch(): Promise<BatchResponse> {
    const res = new BatchResponse(this.cmsClient.rootConfig.i18n || {});

    const promises = [
      this.fetchDocs(res),
      this.fetchQueries(res),
      this.fetchDataSources(res),
    ];
    // If `options.translate` is disabled, any explicitly-added translations
    // can be fetched in parallel with the other docs.
    if (!this.options.translate && this.translationsIds.length > 0) {
      promises.push(this.fetchTranslations(res));
    }

    await Promise.all(promises);

    // If `options.translate` is enabled, `fetchDocs()` and `fetchQueries()`
    // auto-collect each doc's translations id, so translations are fetched
    // after all the other docs are fetched.
    if (this.options.translate) {
      await this.fetchTranslations(res);
    }

    return res;
  }

  private async fetchDocs(res: BatchResponse) {
    if (this.docIds.length === 0) {
      return;
    }
    const docRefs = this.docIds.map((docId) => {
      const [collectionId, slug] = docId.split('/');
      return this.cmsClient.dbDocRef(collectionId, slug, {
        mode: this.options.mode,
      });
    });
    const docs = await this.db.getAll(...docRefs);
    this.docIds.forEach((docId, i) => {
      const doc = docs[i];
      if (!doc.exists) {
        console.warn(`doc "${docId}" does not exist`);
        return;
      }
      const docData = unmarshalData(doc.data()) as Doc;
      res.docs[docId] = docData;

      if (this.options.translate) {
        this.docTranslationsIds.push(docId);
      }
    });
  }

  private async fetchQueries(res: BatchResponse) {
    if (this.queries.length === 0) {
      return;
    }
    const mode = this.options.mode;

    const handleQuery = async (queryItem: BatchRequestQuery) => {
      const docsPath = this.cmsClient.dbCollectionDocsPath(
        queryItem.collectionId,
        {mode}
      );
      const queryOptions = queryItem.queryOptions || {};
      let query: Query = this.db.collection(docsPath);
      if (queryOptions.limit) {
        query = query.limit(queryOptions.limit);
      }
      if (queryOptions.offset) {
        query = query.offset(queryOptions.offset);
      }
      if (queryOptions.orderBy) {
        query = query.orderBy(
          queryOptions.orderBy,
          queryOptions.orderByDirection
        );
      }
      if (queryOptions.query) {
        query = queryOptions.query(query);
      }
      const results = await query.get();
      const docs: Doc[] = [];
      results.forEach((result) => {
        const doc = unmarshalData(result.data()) as Doc;
        docs.push(doc);
        // Based on the results of the query, fetch the corresponding
        // translations for each doc.
        if (this.options.translate && doc.id) {
          this.queryTranslationsIds.push(doc.id);
        }
      });
      res.queries[queryItem.queryId] = docs;
    };

    await Promise.all(this.queries.map((queryItem) => handleQuery(queryItem)));
  }

  private async fetchDataSources(res: BatchResponse) {
    if (this.dataSourceIds.length === 0) {
      return;
    }
    const docRefs = this.dataSourceIds.map((dataSourceId) => {
      return this.cmsClient.dbDataSourceDataRef(dataSourceId, {
        mode: this.options.mode,
      });
    });
    const docs = await this.db.getAll(...docRefs);
    this.dataSourceIds.forEach((dataSourceId, i) => {
      const doc = docs[i];
      if (!doc.exists) {
        console.warn(`"data source "${dataSourceId}" does not exist`);
        return;
      }
      res.dataSources[dataSourceId] = doc.data() as DataSourceData;
    });
  }

  private async fetchTranslations(res: BatchResponse) {
    // Order the translations ids so that precedence is deterministic:
    // generic translations (e.g. "common") first, docs returned from queries
    // next, and specific docs (e.g. "Pages/index") last.
    const translationsIds = Array.from(
      new Set([
        ...this.translationsIds,
        ...this.queryTranslationsIds,
        ...this.docTranslationsIds,
      ])
    );
    if (translationsIds.length === 0) {
      return;
    }
    const mode = this.options.mode;
    const project = this.cmsClient.projectId;
    const i18nConfig = this.cmsClient.rootConfig.i18n || {};

    const locales = this.options.locales || i18nConfig.locales;
    if (locales && locales.length > 0) {
      // When the locales are known, expand each locale through its fallback
      // chain and fetch the exact locale doc refs with `getAll()`.
      const localeSet = new Set<string>();
      for (const locale of locales) {
        for (const fallback of resolveLocaleFallbacks(i18nConfig, locale)) {
          localeSet.add(fallback);
        }
      }
      const localeDocRefs: Array<{
        translationsId: string;
        locale: string;
        ref: FirebaseFirestore.DocumentReference;
      }> = [];
      for (const translationsId of translationsIds) {
        for (const locale of localeSet) {
          const dbPath = buildTranslationsLocaleDocDbPath({
            project,
            mode,
            id: translationsId,
            locale,
          });
          localeDocRefs.push({
            translationsId,
            locale,
            ref: this.db.doc(dbPath),
          });
        }
      }
      // Fetch the refs in chunks. Missing locale docs are fine (e.g. a
      // translations doc may not have every locale).
      const chunks = chunkArray(localeDocRefs, 300);
      const snapshotChunks = await Promise.all(
        chunks.map((chunk) => this.db.getAll(...chunk.map((item) => item.ref)))
      );
      const snapshots = snapshotChunks.flat();
      localeDocRefs.forEach((item, i) => {
        const snapshot = snapshots[i];
        if (!snapshot.exists) {
          return;
        }
        res.translations[item.translationsId] ??= {};
        res.translations[item.translationsId][item.locale] =
          snapshot.data() as TranslationsLocaleDoc;
      });
    } else {
      // When the locales are unknown, query the translations locale docs by
      // translations id (chunked due to Firestore's `in` query limits).
      const dbPath = buildTranslationsDbPath({project, mode});
      const collectionRef = this.db.collection(dbPath);
      const snapshots = await Promise.all(
        chunkArray(translationsIds, 10).map((chunk) =>
          collectionRef.where('id', 'in', chunk).get()
        )
      );
      const localeDocsById: Record<string, TranslationsLocaleDoc[]> = {};
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((doc) => {
          const localeDoc = doc.data() as TranslationsLocaleDoc;
          localeDocsById[localeDoc.id] ??= [];
          localeDocsById[localeDoc.id].push(localeDoc);
        });
      });
      // Store the results in insertion (precedence) order.
      for (const translationsId of translationsIds) {
        for (const localeDoc of localeDocsById[translationsId] || []) {
          res.translations[translationsId] ??= {};
          res.translations[translationsId][localeDoc.locale] = localeDoc;
        }
      }
    }
  }
}

export class BatchResponse {
  docs: Record<string, Doc> = {};
  queries: Record<string, Doc[]> = {};
  dataSources: Record<string, DataSourceData> = {};
  /**
   * Translations locale docs retrieved in the request, keyed by translations
   * id then by locale. The ids are in precedence order: generic translations
   * (e.g. "common") first, doc-specific translations last.
   */
  translations: Record<string, Record<string, TranslationsLocaleDoc>> = {};

  private i18nConfig: RootConfig['i18n'];

  constructor(i18nConfig?: RootConfig['i18n']) {
    this.i18nConfig = i18nConfig || {};
  }

  /**
   * Returns a map of translations for a given locale or locale fallbacks.
   *
   * The input is either a single locale (e.g. "de"), which is expanded
   * through the fallback chain configured in `i18n.fallbacks`, or an array of
   * locales representing an explicit fallback chain, e.g.
   * `["en-CA", "en-GB", "en"]`.
   *
   * The returned value is a flat map of source string to translated string,
   * e.g.:
   * {"<source>": "<translation>"}
   */
  getTranslations(locale: string | string[]): LocaleTranslations {
    const fallbackLocales = Array.isArray(locale)
      ? locale
      : resolveLocaleFallbacks(this.i18nConfig, locale);

    // Merge the strings from all of the translations docs. The docs are
    // merged in precedence order (generic translations first, doc-specific
    // translations last) so that later docs override earlier ones.
    const merged: Record<
      string,
      {source: string; translations: Record<string, string>}
    > = {};
    for (const localeDocs of Object.values(this.translations)) {
      for (const localeDoc of Object.values(localeDocs)) {
        const strings = localeDoc.strings || {};
        for (const hash in strings) {
          const entry = strings[hash];
          merged[hash] ??= {source: entry.source, translations: {}};
          if (entry.translation) {
            merged[hash].translations[localeDoc.locale] = entry.translation;
          }
        }
      }
    }

    // For each string, pick the first locale in the fallback chain with a
    // non-empty translation, falling back to the source string.
    const localeTranslations: LocaleTranslations = {};
    for (const item of Object.values(merged)) {
      let translation = item.source;
      for (const fallbackLocale of fallbackLocales) {
        if (item.translations[fallbackLocale]) {
          translation = item.translations[fallbackLocale];
          break;
        }
      }
      localeTranslations[item.source] = translation;
    }
    return localeTranslations;
  }
}
