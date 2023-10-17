import path from 'node:path';
import {Plugin, RootConfig} from '@blinkk/root';
import {viteSsrLoadModule} from '@blinkk/root/node';
import {App} from 'firebase-admin/app';
import {
  FieldValue,
  Firestore,
  Query,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import {CMSPlugin} from './plugin.js';
import {Schema} from './schema.js';

export interface Doc<Fields = any> {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collectionId: string;
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
    locales?: string[];
  };
  fields: Fields;
}

export type DocMode = 'draft' | 'published';

export interface GetDocOptions {
  /** Mode, either "draft" or "published". */
  mode: DocMode;
}

export interface SetDocOptions {
  /** Mode, either "draft" or "published". */
  mode: DocMode;
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

export class RootCMSClient {
  private readonly rootConfig: RootConfig;
  private readonly cmsPlugin: CMSPlugin;
  private readonly projectId: string;
  private readonly app: App;
  private readonly db: Firestore;

  constructor(rootConfig: RootConfig) {
    this.rootConfig = rootConfig;
    this.cmsPlugin = getCmsPlugin(rootConfig);

    const cmsPluginOptions = this.cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.app = this.cmsPlugin.getFirebaseApp();
    this.db = getFirestore(this.app);
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
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
    // Slugs with slashes are encoded as `--` in the DB.
    slug = slug.replaceAll('/', '--');
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
    const docRef = this.db.doc(dbPath);
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data();
    }
    return null;
  }

  /**
   * Sets data for a doc.
   */
  async setDoc(
    collectionId: string,
    slug: string,
    data: Doc,
    options: SetDocOptions
  ) {
    const schema = await this.getSchema(collectionId);
    if (!schema) {
      throw new Error(`schema not found for: ${collectionId}`);
    }
    const rawData = marshalData(data, schema);
    const modifiedBy = options.modifiedBy || 'root-cms-client';

    // Update sys created/modified times.
    if (!rawData.sys) {
      const currentData = await this.getRawDoc(collectionId, slug, {
        mode: options.mode,
      });
      if (currentData) {
        rawData.sys = currentData?.sys || {};
      } else {
        rawData.sys.createdAt = Timestamp.now();
        rawData.sys.createdBy = modifiedBy;
        rawData.sys.locales = ['en'];
      }
    }
    rawData.sys.modifiedAt = Timestamp.now();
    rawData.sys.modifiedBy = modifiedBy;

    await this.setRawDoc(collectionId, slug, rawData, options);
  }

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
      const firstPublishedBy = sys.firstPublishedBy ?? (scheduledBy || '');

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
        'sys.publishedBy': scheduledBy || '',
      });
      batchCount += 1;

      publishedDocs.push(doc);

      if (batchCount >= 498) {
        break;
      }
    }

    await batch.commit();
    console.log(`published ${publishedDocs.length} docs!`);
    return publishedDocs;
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
   * Loads the schema for a given collection.
   */
  async getSchema(collectionId: string): Promise<Schema | null> {
    const schemaFile = path.join('/collections', `${collectionId}.schema.ts`);
    const schemaModule = await viteSsrLoadModule(this.rootConfig, schemaFile);
    return schemaModule?.default || null;
  }
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
        const arr = val._array.map((k: string) => unmarshalData(val[k] || {}));
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

/**
 * Serializes data for storage in the database.
 */
export function marshalData(data: any, schema: Schema): any {
  // TODO(stevenle): impl.
  return data;
}

export interface ArrayObject {
  [key: string]: any;
  _array: string[];
}

/**
 * Serializes an array into an "array object", e.g.:
 *
 * ```
 * marshalArray([1, 2, 3])
 * // => {a: 1, b: 2, c: 3, _array: ['a', 'b', 'c']}
 * ```
 *
 * This database storage method makes it easier to update a single field in a
 * deeply nested array object.
 */
export function marshalArray(arr: Array<any>): ArrayObject {
  if (!Array.isArray(arr)) {
    return arr;
  }
  const arrayObject: ArrayObject = {_array: []};
  for (const item of arr) {
    const key = randString(6);
    arrayObject[key] = item;
    arrayObject._array.push(key);
  }
  return arrayObject;
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
