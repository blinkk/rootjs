import crypto from 'node:crypto';
import {RootConfig} from '@blinkk/root';
import {App} from 'firebase-admin/app';
import {
  FieldValue,
  Firestore,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {CMSPlugin, getCmsPlugin} from './plugin.js';

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

export interface TranslationsDoc {
  id: string;
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
  };
  strings: TranslationsMap;
}

export type DocMode = 'draft' | 'published';

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export type HttpMethod = 'GET' | 'POST';

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
  createdAt: Timestamp;
  createdBy: string;
  syncedAt?: Timestamp;
  syncedBy?: string;
  publishedAt?: Timestamp;
  publishedBy?: string;
}

export interface DataSourceData<T = any> {
  dataSource: DataSource;
  data: T;
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
}

export interface ListDocsOptions {
  mode: DocMode;
  offset?: number;
  limit?: number;
  orderBy?: string;
  orderByDirection?: 'asc' | 'desc';
  query?: (query: Query) => Query;
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
    const mode = options.mode;
    const docRef = this.dbDocRef(collectionId, slug, {mode});
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  }

  dbCollectionDocsPath(
    collectionId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    let modeCollection = '';
    if (options.mode === 'draft') {
      modeCollection = 'Drafts';
    } else if (options.mode === 'published') {
      modeCollection = 'Published';
    } else {
      throw new Error(`unknown mode: ${options.mode}`);
    }
    return `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}`;
  }

  dbDocPath(
    collectionId: string,
    slug: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const collectionDocsPath = this.dbCollectionDocsPath(collectionId, options);
    // Slugs with slashes are encoded as `--` in the DB.
    const normalizedSlug = slug.replaceAll('/', '--');
    return `${collectionDocsPath}/${normalizedSlug}`;
  }

  dbDocRef(
    collectionId: string,
    slug: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const docPath = this.dbDocPath(collectionId, slug, options);
    return this.db.doc(docPath);
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
   * Prefer `saveDraftData('Pages/foo', data)`. Only use this if you know what
   * you're doing.
   */
  async setRawDoc(
    collectionId: string,
    slug: string,
    data: any,
    options: SetDocOptions
  ) {
    const mode = options.mode;
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
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
    const mode = options.mode;
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
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
      const doc = unmarshalData(result.data()) as T;
      docs.push(doc);
    });
    return {docs};
  }

  /**
   * Returns the number of docs in a Root.js CMS collection.
   */
  async getDocsCount(collectionId: string, options: GetCountOptions) {
    const mode = options.mode;
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
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
    options?: {publishedBy: string; batch?: WriteBatch}
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
      await this.publishDocs(release.docIds || [], {publishedBy, batch});
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
        data.tags = tags;
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
      return doc.data() as DataSource;
    }
    return null;
  }

  /**
   * Syncs a data source to draft state.
   */
  async syncDataSource(dataSourceId: string, options?: {syncedBy?: string}) {
    const dataSource = await this.getDataSource(dataSourceId);
    if (!dataSource) {
      throw new Error(`data source not found: ${dataSourceId}`);
    }

    const data = await this.fetchData(dataSource);

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
      data: data,
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

  private async fetchData(dataSource: DataSource) {
    if (dataSource.type === 'http') {
      return await this.fetchHttpData(dataSource);
    }
    // TODO(stevenle): impl.
    // if (dataSource.type === 'gsheet') {
    //   return await fetchGsheetData(dataSource);
    // }
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
   * Fetches data from a data source.
   */
  async getFromDataSource<T = any>(
    dataSourceId: string,
    options?: {mode?: 'draft' | 'published'}
  ): Promise<DataSourceData<T> | null> {
    const mode = options?.mode || 'published';

    const docRef = this.dbDataSourceDataRef(dataSourceId, {mode});
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data() as DataSourceData<T>;
    }
    return null;
  }

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

  dbDataSourceDataRef(
    dataSourceId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const dbPath = this.dbDataSourceDataPath(dataSourceId, options);
    return this.db.doc(dbPath);
  }

  dbTranslationsPath(
    translationsId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const mode = options.mode;
    if (!(mode === 'draft' || mode === 'published')) {
      throw new Error(`invalid mode: ${mode}`);
    }
    const slug = translationsId.replaceAll('/', '--');
    const dbPath = `Projects/${this.projectId}/TranslationsManager/${mode}/Translations/${slug}`;
    return dbPath;
  }

  dbTranslationsRef(
    translationsId: string,
    options: {mode: 'draft' | 'published'}
  ) {
    const dbPath = this.dbTranslationsPath(translationsId, options);
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

  async logAction(action: string, options?: {by?: string; metadata?: any}) {
    if (!action) {
      throw new Error('missing required: "action"');
    }
    const data = {
      action: action,
      timestamp: Timestamp.now(),
      by: options?.by || 'system',
      metadata: options?.metadata || {},
    };
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
  }

  createBatchRequest(options: BatchRequestOptions): BatchRequest {
    return new BatchRequest(this, options);
  }
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
   * The returned value is a flat map of source string to translated string,
   * e.g.:
   * {"<source>": "<translation>"}
   */
  getTranslations(locale: string | string[]): LocaleTranslations {
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
  locale: string | string[]
) {
  const localeTranslations: LocaleTranslations = {};

  const fallbackLocales = Array.isArray(locale) ? locale : [locale];
  if (!fallbackLocales.includes('en')) {
    fallbackLocales.push('en');
  }

  Object.values(translationsMap).forEach((string) => {
    const source = string.source;
    let translation = source;
    for (const fallbackLocale of fallbackLocales) {
      if (string[fallbackLocale]) {
        translation = string[fallbackLocale];
      }
    }
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
  const slug = docId.slice(sepIndex + 1).replaceAll('/', '--');
  if (!collection || !slug) {
    throw new Error(`invalid doc id: ${docId}`);
  }
  return {collection, slug};
}

export {getCmsPlugin};
