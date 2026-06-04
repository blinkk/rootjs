import crypto from 'node:crypto';
import {type Plugin, type RootConfig} from '@blinkk/root';
import {App} from 'firebase-admin/app';
import {
  DocumentReference,
  FieldValue,
  Firestore,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {
  Asset,
  AssetFile,
  AssetFolder,
  assetFieldValueIsCurrent,
  assetToFieldValue,
  buildUsageKey,
  isAssetRef,
  normalizeAssetDir,
} from '../shared/asset.js';
import {collectPathsByPredicate} from '../shared/marshal.js';
import {normalizeSlug} from '../shared/slug.js';
import {CMSPlugin} from './plugin.js';
import {Collection} from './schema.js';
import {TranslationsManager} from './translations-manager.js';
import {validateFields} from './validation.js';
import {setValueAtPath} from './values.js';

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
  };
  fields: Fields;
}

export type DocMode = 'draft' | 'published';

export type UserRole = 'ADMIN' | 'EDITOR' | 'CONTRIBUTOR' | 'VIEWER';

export type HttpMethod = 'GET' | 'POST';

export type CronUnit = 'minutes' | 'hours' | 'days';

export interface DataSourceCron {
  enabled: boolean;
  interval: number;
  unit: CronUnit;
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

export class RootCMSClient {
  readonly rootConfig: RootConfig;
  readonly cmsPlugin: CMSPlugin;
  readonly projectId: string;
  readonly app: App;
  readonly db: Firestore;

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
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderByDirection);
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

    // // Each transaction or batch can write a max of 500 ops.
    // // https://firebase.google.com/docs/firestore/manage-data/transactions
    let batchCount = 0;
    const batch = options?.batch || this.db.batch();
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

      publishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
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

    let batchCount = 0;
    const batch = options?.batch || this.db.batch();
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

      unpublishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
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

    // Each transaction or batch can write a max of 500 ops.
    // https://firebase.google.com/docs/firestore/manage-data/transactions
    let batchCount = 0;
    const batch = this.db.batch();
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

      publishedDocs.push(doc);

      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
        continue;
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
      const batch = this.db.batch();
      const publishedBy = release.scheduledBy || 'root-cms-client';
      batch.update(snapshot.ref, {
        publishedAt: Timestamp.now(),
        publishedBy: publishedBy,
        scheduledAt: FieldValue.delete(),
        scheduledBy: FieldValue.delete(),
      });
      const dataSourceIds = release.dataSourceIds || [];
      if (dataSourceIds.length > 0) {
        await this.publishDataSources(dataSourceIds, {
          publishedBy,
          batch,
          commitBatch: false,
        });
      }
      await this.publishDocs(release.docIds || [], {
        publishedBy,
        batch,
        releaseId: release.id,
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
      if (
        !cron ||
        !cron.enabled ||
        typeof cron.interval !== 'number' ||
        !cron.unit
      ) {
        continue;
      }

      // Normalize and validate the interval value.
      const interval = Number(cron.interval);
      if (
        !Number.isFinite(interval) ||
        interval <= 0 ||
        !Number.isInteger(interval)
      ) {
        continue;
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
          continue;
      }

      // Check if enough time has passed since the last sync.
      let lastSyncMs = dataSource.syncedAt ? dataSource.syncedAt.toMillis() : 0;
      // Guard against future syncedAt values (e.g., from skewed client clocks)
      // so that now - lastSyncMs does not become negative and block scheduling.
      if (lastSyncMs > now) {
        lastSyncMs = now;
      }
      if (now - lastSyncMs < intervalMs) {
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
    const cmsPluginOptions = this.cmsPlugin.getConfig();
    if (cmsPluginOptions.experiments?.v2TranslationsManager) {
      throw new Error(
        '`v2TranslationsManager` is not enabled. update root.config.ts and add: `{experiments: {v2TranslationsManager: true}}`'
      );
    }
    return new TranslationsManager(this);
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
   * Firestore path for a translations file.
   */
  dbTranslationsPath(
    translationsId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const mode = options.mode;
    if (!(mode === 'draft' || mode === 'published')) {
      throw new Error(`invalid mode: ${mode}`);
    }
    const slug = normalizeSlug(translationsId);
    const dbPath = `Projects/${this.projectId}/TranslationsManager/${mode}/Translations/${slug}`;
    return dbPath;
  }

  /**
   * Firestore doc ref for a translations file.
   */
  dbTranslationsRef(
    translationsId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const dbPath = this.dbTranslationsPath(translationsId, options);
    return this.db.doc(dbPath);
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
   * Gets the user's role from the project's ACL.
   */
  async getUserRole(email: string): Promise<UserRole | null> {
    if (!email) {
      return null;
    }
    const docRef = this.db.doc(`Projects/${this.projectId}`);
    const snapshot = await docRef.get();
    const data = snapshot.data() || {};
    const acl = data.roles || {};

    if (email in acl) {
      return acl[email];
    }

    // Check wildcard domains, e.g. `*@example.com`.
    if (!email.includes('@')) {
      console.warn(`invalid email: ${email}`);
      return null;
    }
    const domain = email.split('@').at(-1);
    if (domain && `*@${domain}` in acl) {
      return acl[`*@${domain}`];
    }
    return null;
  }

  /**
   * Verifies user exists in the ACL list.
   */
  async userExistsInAcl(email: string): Promise<boolean> {
    if (!email) {
      return false;
    }
    const docRef = this.db.doc(`Projects/${this.projectId}`);
    const snapshot = await docRef.get();
    const data = snapshot.data() || {};
    const acl = data.roles || {};
    if (email in acl) {
      return true;
    }

    // Check wildcard domains, e.g. `*@example.com`.
    if (!email.includes('@')) {
      console.warn(`invalid email: ${email}`);
      return false;
    }
    const domain = email.split('@').at(-1);
    if (domain && `*@${domain}` in acl) {
      return true;
    }
    return false;
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
   * Creates a batch request that is capable of fetching one or more docs,
   * corresponding translations, and dataSources.
   */
  createBatchRequest(options: BatchRequestOptions): BatchRequest {
    return new BatchRequest(this, options);
  }

  // ===========================================================================
  // Asset library
  //
  // Assets are library entries stored at `Projects/{projectId}/Assets/{assetId}`
  // that hold canonical file metadata. When an image/file field picks an asset,
  // the asset's data is denormalized inline onto the doc (so doc GETs stay O(1)
  // Firestore RPCs); replacing the asset fans the new data out to every
  // referencing DRAFT doc.
  //
  // Usage is tracked by two server-maintained indexes (security rules forbid
  // client writes outside `Drafts/**`):
  //   - reverse: `Assets/{assetId}/Usages/{docKey}` -> {docId, collection, slug}
  //   - forward: `AssetUsagesByDoc/{docKey}`        -> {docId, assetIds: []}
  // ===========================================================================

  dbAssetsPath() {
    return `Projects/${this.projectId}/Assets`;
  }

  dbAssetRef(assetId: string) {
    return this.db.doc(`${this.dbAssetsPath()}/${assetId}`);
  }

  dbAssetUsagesPath(assetId: string) {
    return `${this.dbAssetsPath()}/${assetId}/Usages`;
  }

  dbAssetUsageRef(assetId: string, docId: string) {
    return this.db.doc(
      `${this.dbAssetUsagesPath(assetId)}/${buildUsageKey(docId)}`
    );
  }

  dbAssetUsagesByDocRef(docId: string) {
    return this.db.doc(
      `Projects/${this.projectId}/AssetUsagesByDoc/${buildUsageKey(docId)}`
    );
  }

  dbAssetFoldersPath() {
    return `Projects/${this.projectId}/AssetFolders`;
  }

  /** Reads a single asset. */
  async getAsset(assetId: string): Promise<Asset | null> {
    const snapshot = await this.dbAssetRef(assetId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as Asset;
  }

  /** Lists assets, optionally filtered to a single folder (`dir`). */
  async listAssets(options?: {dir?: string}): Promise<{assets: Asset[]}> {
    let query: Query = this.db.collection(this.dbAssetsPath());
    if (options?.dir !== undefined) {
      query = query.where('dir', '==', normalizeAssetDir(options.dir));
    }
    const snapshot = await query.get();
    const assets = snapshot.docs.map((doc) => doc.data() as Asset);
    return {assets};
  }

  /** Creates a new library asset from an uploaded file. */
  async createAsset(
    file: AssetFile,
    options: {createdBy: string; dir?: string; assetId?: string}
  ): Promise<Asset> {
    const assetId = options.assetId || generateAssetId();
    const now = Date.now();
    const asset: Asset = {
      ...stripUndefinedValues(file),
      id: assetId,
      version: 1,
      dir: normalizeAssetDir(options.dir),
      sys: {
        createdAt: now,
        createdBy: options.createdBy,
        modifiedAt: now,
        modifiedBy: options.createdBy,
      },
    };
    await this.dbAssetRef(assetId).set(asset);
    return asset;
  }

  /**
   * Replaces an asset's file (bytes already uploaded to GCS by the client) and
   * fans the new file out to every referencing draft doc.
   */
  async replaceAsset(
    assetId: string,
    newFile: AssetFile,
    options: {replacedBy: string}
  ): Promise<{asset: Asset; docsUpdated: number}> {
    const existing = await this.getAsset(assetId);
    if (!existing) {
      throw new Error(`asset not found: ${assetId}`);
    }
    const now = Date.now();
    const asset: Asset = {
      ...existing,
      ...stripUndefinedValues(newFile),
      id: assetId,
      version: (existing.version || 0) + 1,
      // Folder placement and asset-authoritative alt are preserved across a file
      // replacement unless the new file explicitly provides an alt.
      dir: existing.dir,
      alt: newFile.alt ?? existing.alt,
      sys: {
        ...(existing.sys || {}),
        modifiedAt: now,
        modifiedBy: options.replacedBy,
        replacedAt: now,
        replacedBy: options.replacedBy,
      },
    };
    await this.dbAssetRef(assetId).set(asset);
    const {docsUpdated} = await this.fanOutAsset(asset, options.replacedBy);
    return {asset, docsUpdated};
  }

  /**
   * Updates an asset's (asset-authoritative) alt text and fans it out to every
   * referencing draft doc.
   */
  async setAssetAlt(
    assetId: string,
    alt: string,
    options: {updatedBy: string}
  ): Promise<{asset: Asset; docsUpdated: number}> {
    const existing = await this.getAsset(assetId);
    if (!existing) {
      throw new Error(`asset not found: ${assetId}`);
    }
    const asset: Asset = {
      ...existing,
      alt,
      version: (existing.version || 0) + 1,
      sys: {
        ...(existing.sys || {}),
        modifiedAt: Date.now(),
        modifiedBy: options.updatedBy,
      },
    };
    await this.dbAssetRef(assetId).set(asset);
    const {docsUpdated} = await this.fanOutAsset(asset, options.updatedBy);
    return {asset, docsUpdated};
  }

  /**
   * Rewrites the inline value(s) of every draft doc that references `asset` so
   * they pick up the asset's current file/alt. Re-scans each doc (rather than
   * trusting stored paths) so it is robust to array reorders, paste, and
   * duplication. Drafts only — published copies update on next publish.
   */
  private async fanOutAsset(
    asset: Asset,
    modifiedBy: string
  ): Promise<{docsUpdated: number}> {
    const usagesSnapshot = await this.db
      .collection(this.dbAssetUsagesPath(asset.id))
      .get();
    const usages = usagesSnapshot.docs.map(
      (d) => d.data() as {docId: string; collection: string; slug: string}
    );
    if (usages.length === 0) {
      return {docsUpdated: 0};
    }

    const newValue = assetToFieldValue(asset);
    const predicate = (n: any) => isAssetRef(n) && n.assetId === asset.id;

    let docsUpdated = 0;
    let batch = this.db.batch();
    let batchCount = 0;
    const staleUsageRefs: DocumentReference[] = [];

    const chunkSize = 200;
    for (let i = 0; i < usages.length; i += chunkSize) {
      const chunk = usages.slice(i, i + chunkSize);
      const refs = chunk.map((u) =>
        this.dbDocRef(u.collection, u.slug, {mode: 'draft'})
      );
      const snapshots = await this.db.getAll(...refs);
      for (let j = 0; j < snapshots.length; j++) {
        const snapshot = snapshots[j];
        const usage = chunk[j];
        const data = snapshot.data();
        if (!data) {
          staleUsageRefs.push(this.dbAssetUsageRef(asset.id, usage.docId));
          continue;
        }
        const paths = collectPathsByPredicate(data.fields || {}, predicate, {
          prefix: 'fields',
        });
        if (paths.length === 0) {
          staleUsageRefs.push(this.dbAssetUsageRef(asset.id, usage.docId));
          continue;
        }
        const updates: Record<string, any> = {};
        for (const path of paths) {
          const current = getValueAtPath(data, path);
          if (assetFieldValueIsCurrent(current, asset)) {
            continue;
          }
          updates[path] = newValue;
        }
        if (Object.keys(updates).length === 0) {
          continue;
        }
        updates['sys.modifiedAt'] = FieldValue.serverTimestamp();
        updates['sys.modifiedBy'] = modifiedBy;
        batch.update(snapshot.ref, updates);
        batchCount += 1;
        docsUpdated += 1;
        if (batchCount >= 400) {
          await batch.commit();
          batch = this.db.batch();
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
    if (staleUsageRefs.length > 0) {
      await this.deleteRefs(staleUsageRefs);
    }
    return {docsUpdated};
  }

  /**
   * Reconciles the usage indexes for a single draft doc. Called on pick/detach,
   * on a debounced draft flush, and after copy/create. Server-authoritative.
   */
  async syncUsagesForDoc(docId: string): Promise<void> {
    const {collection, slug} = parseDocId(docId);
    const data = await this.getRawDoc(collection, slug, {mode: 'draft'});

    const currAssetIds = new Set<string>();
    if (data) {
      const paths = collectPathsByPredicate(
        data.fields || {},
        (n) => isAssetRef(n),
        {prefix: 'fields'}
      );
      for (const path of paths) {
        const value = getValueAtPath(data, path);
        if (value?.assetId) {
          currAssetIds.add(value.assetId);
        }
      }
    }

    const forwardRef = this.dbAssetUsagesByDocRef(docId);
    const forwardSnapshot = await forwardRef.get();
    const prevAssetIds: string[] = forwardSnapshot.exists
      ? forwardSnapshot.data()?.assetIds || []
      : [];

    const toAdd = [...currAssetIds].filter((id) => !prevAssetIds.includes(id));
    const toRemove = prevAssetIds.filter((id) => !currAssetIds.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }

    const batch = this.db.batch();
    for (const assetId of toAdd) {
      batch.set(this.dbAssetUsageRef(assetId, docId), {docId, collection, slug});
    }
    for (const assetId of toRemove) {
      batch.delete(this.dbAssetUsageRef(assetId, docId));
    }
    if (currAssetIds.size > 0) {
      batch.set(forwardRef, {docId, assetIds: [...currAssetIds]});
    } else {
      batch.delete(forwardRef);
    }
    await batch.commit();
  }

  /** Removes all usage-index entries for a doc (call on doc delete). */
  async purgeDocUsages(docId: string): Promise<void> {
    const forwardRef = this.dbAssetUsagesByDocRef(docId);
    const forwardSnapshot = await forwardRef.get();
    if (!forwardSnapshot.exists) {
      return;
    }
    const assetIds: string[] = forwardSnapshot.data()?.assetIds || [];
    const batch = this.db.batch();
    for (const assetId of assetIds) {
      batch.delete(this.dbAssetUsageRef(assetId, docId));
    }
    batch.delete(forwardRef);
    await batch.commit();
  }

  /** Returns the number of docs referencing an asset (reverse-index count). */
  async getAssetUsageCount(assetId: string): Promise<number> {
    const snapshot = await this.db
      .collection(this.dbAssetUsagesPath(assetId))
      .count()
      .get();
    return snapshot.data().count;
  }

  /**
   * Deletes a library asset. Throws if the asset is still in use unless
   * `force` is set. GCS bytes are intentionally NOT deleted (the same object
   * may be referenced by independent uploads elsewhere).
   */
  async deleteAsset(assetId: string, options?: {force?: boolean}): Promise<void> {
    const usageCount = await this.getAssetUsageCount(assetId);
    if (usageCount > 0 && !options?.force) {
      throw new Error(`asset is in use by ${usageCount} doc(s)`);
    }
    await this.deleteCollectionDocs(this.dbAssetUsagesPath(assetId));
    await this.dbAssetRef(assetId).delete();
  }

  /** Lists asset folders, optionally filtered to direct children of `parent`. */
  async listAssetFolders(parent?: string): Promise<{folders: AssetFolder[]}> {
    let query: Query = this.db.collection(this.dbAssetFoldersPath());
    if (parent !== undefined) {
      query = query.where('parent', '==', normalizeAssetDir(parent));
    }
    const snapshot = await query.get();
    const folders = snapshot.docs.map((d) => d.data() as AssetFolder);
    return {folders};
  }

  /** Creates an (initially empty) asset folder. */
  async createAssetFolder(options: {
    name: string;
    parent?: string;
  }): Promise<AssetFolder> {
    const parent = normalizeAssetDir(options.parent);
    const name = options.name.trim();
    if (!name || name.includes('/')) {
      throw new Error(`invalid folder name: ${options.name}`);
    }
    const path = parent === '/' ? `/${name}` : `${parent}/${name}`;
    const folderId = buildUsageKey(path.slice(1));
    const folder: AssetFolder = {id: folderId, path, name, parent};
    await this.db.doc(`${this.dbAssetFoldersPath()}/${folderId}`).set(folder);
    return folder;
  }

  /** Moves an asset into a different folder (library-only; no doc fan-out). */
  async moveAsset(assetId: string, dir: string): Promise<void> {
    await this.dbAssetRef(assetId).update({dir: normalizeAssetDir(dir)});
  }

  /** Renames an asset's display filename (library-only; no doc fan-out). */
  async renameAsset(assetId: string, filename: string): Promise<void> {
    await this.dbAssetRef(assetId).update({filename});
  }

  /**
   * Rebuilds the usage indexes from scratch by scanning all draft docs. ADMIN
   * backstop for drift from paste/duplication/JSON edits/migration.
   */
  async rebuildAllUsages(): Promise<{docsScanned: number; usages: number}> {
    const projectPrefix = `Projects/${this.projectId}/Collections/`;
    const snapshot = await this.db.collectionGroup('Drafts').get();
    const reverse = new Map<
      string,
      Map<string, {collection: string; slug: string}>
    >();
    const forward = new Map<string, string[]>();
    let docsScanned = 0;
    for (const docSnapshot of snapshot.docs) {
      if (!docSnapshot.ref.path.startsWith(projectPrefix)) {
        continue;
      }
      const data = docSnapshot.data();
      if (!data || !data.id || !data.collection || !data.slug) {
        continue;
      }
      docsScanned += 1;
      const paths = collectPathsByPredicate(
        data.fields || {},
        (n) => isAssetRef(n),
        {prefix: 'fields'}
      );
      const assetIds = new Set<string>();
      for (const path of paths) {
        const value = getValueAtPath(data, path);
        if (value?.assetId) {
          assetIds.add(value.assetId);
        }
      }
      if (assetIds.size === 0) {
        continue;
      }
      forward.set(data.id, [...assetIds]);
      for (const assetId of assetIds) {
        if (!reverse.has(assetId)) {
          reverse.set(assetId, new Map());
        }
        reverse
          .get(assetId)!
          .set(data.id, {collection: data.collection, slug: data.slug});
      }
    }

    // Wipe the existing indexes, then write the freshly computed ones.
    await this.deleteCollectionDocs(
      `Projects/${this.projectId}/AssetUsagesByDoc`
    );
    const assetsSnapshot = await this.db.collection(this.dbAssetsPath()).get();
    for (const assetDoc of assetsSnapshot.docs) {
      await this.deleteCollectionDocs(this.dbAssetUsagesPath(assetDoc.id));
    }

    let batch = this.db.batch();
    let count = 0;
    let usages = 0;
    const maybeCommit = async (force = false) => {
      if (count > 0 && (force || count >= 400)) {
        await batch.commit();
        batch = this.db.batch();
        count = 0;
      }
    };
    for (const [docId, assetIds] of forward) {
      batch.set(this.dbAssetUsagesByDocRef(docId), {docId, assetIds});
      count += 1;
      await maybeCommit();
    }
    for (const [assetId, docs] of reverse) {
      for (const [docId, info] of docs) {
        batch.set(this.dbAssetUsageRef(assetId, docId), {
          docId,
          collection: info.collection,
          slug: info.slug,
        });
        usages += 1;
        count += 1;
        await maybeCommit();
      }
    }
    await maybeCommit(true);
    return {docsScanned, usages};
  }

  /** Deletes every doc in a (sub)collection in chunked batches. */
  private async deleteCollectionDocs(collectionPath: string): Promise<void> {
    const snapshot = await this.db.collection(collectionPath).get();
    await this.deleteRefs(snapshot.docs.map((d) => d.ref));
  }

  /** Deletes a list of doc refs in chunked batches. */
  private async deleteRefs(refs: DocumentReference[]): Promise<void> {
    let batch = this.db.batch();
    let count = 0;
    for (const ref of refs) {
      batch.delete(ref);
      count += 1;
      if (count >= 400) {
        await batch.commit();
        batch = this.db.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
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

/** Resolves a dotted field path against a (stored) object. */
export function getValueAtPath(obj: any, path: string): any {
  const segments = path.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/** Generates a stable, random asset id. */
function generateAssetId(): string {
  return crypto.randomBytes(12).toString('hex');
}

/** Returns a shallow copy of `obj` with all `undefined` values removed. */
function stripUndefinedValues<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

export interface BatchRequestOptions {
  mode: 'draft' | 'published';
  /**
   * Whether to automatically fetch translations for the docs retrieved in the
   * request.
   */
  translate?: boolean;
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

export interface TranslationsDoc {
  id: string;
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
    publishedAt?: Timestamp;
    publishedBy?: string;
    linkedSheet?: {
      spreadsheetId: string;
      gid: number;
      linkedAt: Timestamp;
      linkedBy: string;
    };
    tags?: string[];
  };
  strings: TranslationsMap;
}

export class BatchRequest {
  cmsClient: RootCMSClient;
  private options: BatchRequestOptions;
  private db: Firestore;
  private docIds: string[] = [];
  private dataSourceIds: string[] = [];
  private queries: BatchRequestQuery[] = [];
  private translationsIds: string[] = [];

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
   * Adds a translation file to the request.
   */
  addTranslations(translationsId: string) {
    this.translationsIds.push(translationsId);
  }

  /**
   * Fetches data from the DB.
   */
  async fetch(): Promise<BatchResponse> {
    const res = new BatchResponse();

    const promises = [
      this.fetchDocs(res),
      this.fetchQueries(res),
      this.fetchDataSources(res),
    ];
    // If `options.translate` is disabled and translations are requested,
    // fetch the translations in parallel with the other docs.
    if (!this.options.translate && this.translationsIds.length > 0) {
      promises.push(this.fetchTranslations(res));
    }

    await Promise.all(promises);

    // If `options.translate` is enabled, the fetchX() methods will
    // automatically add each doc's translations id to the request, so
    // translations should be fetched after all the other docs are fetched.
    if (this.translationsIds.length > 0) {
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
        this.addTranslations(docId);
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
    if (this.translationsIds.length === 0) {
      return;
    }

    const docRefs = this.translationsIds.map((translationsId) => {
      return this.cmsClient.dbTranslationsRef(translationsId, {
        mode: this.options.mode,
      });
    });
    const docs = await this.db.getAll(...docRefs);
    this.translationsIds.forEach((translationsId, i) => {
      const doc = docs[i];
      if (!doc.exists) {
        // console.warn(`translations "${translationsId}" does not exist`);
        return;
      }
      res.translations[translationsId] = doc.data() as TranslationsDoc;
    });
  }
}

export class BatchResponse {
  docs: Record<string, Doc> = {};
  queries: Record<string, Doc[]> = {};
  dataSources: Record<string, DataSourceData> = {};
  translations: Record<string, TranslationsDoc> = {};

  /**
   * Returns a map of translations for a given locale or locale fallbacks.
   *
   * The input is either a single locale (e.g. "de") or an array of locales
   * representing the fallback tree, e.g. ["en-CA", "en-GB", "en"].
   *
   * TODO(stevenle): support the locale fallback tree.
   *
   * The returned value is a flat map of source string to translated string,
   * e.g.:
   * {"<source>": "<translation>"}
   */
  getTranslations(locale: string): LocaleTranslations {
    const translationsMap = this.getTranslationsMap();
    const translations = translationsForLocale(translationsMap, locale);
    return translations;
  }

  /**
   * Merges the strings from all translations files retrieved in the request.
   * The returned value is a map of string to translations, e.g.:
   *
   * {"<hash>": {"source": "<source>", "<locale>": "<translation>"}}
   */
  private getTranslationsMap(): TranslationsMap {
    // Load translations in the following order:
    // - generic translations (e.g. "global")
    // - docs returned from queries (e.g. "list all blog posts")
    // - specific docs (e.g. "Pages/index")
    const translationsDocs = Object.values(this.translations).reverse();

    // Consolidate the strings from all of the translations files.
    // {"<hash>": {"source": "<source>", "<locale>": "<translation>"}}
    const translationsMap: TranslationsMap = {};
    for (const translationsDoc of translationsDocs) {
      const strings = translationsDoc.strings || {};
      for (const hash in strings) {
        const translations = strings[hash];
        translationsMap[hash] ??= {source: translations.source};
        for (const locale in translations) {
          if (locale !== 'source' && translations[locale]) {
            translationsMap[hash][locale] = translations[locale];
          }
        }
      }
    }

    return translationsMap;
  }
}
