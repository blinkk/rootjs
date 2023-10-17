import {Plugin, RootConfig} from '@blinkk/root';
import {App} from 'firebase-admin/app';
import {
  FieldValue,
  Firestore,
  Query,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import {CMSPlugin} from './plugin.js';

export interface GetDocOptions {
  mode: 'draft' | 'published';
}

export interface ListDocsOptions {
  mode: 'draft' | 'published';
  offset?: number;
  limit?: number;
  orderBy?: string;
  orderByDirection?: 'asc' | 'desc';
  query?: (query: Query) => Query;
}

export interface GetCountOptions {
  mode: 'draft' | 'published';
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
  private readonly cmsPlugin: CMSPlugin;
  private readonly projectId: string;
  private readonly app: App;
  private readonly db: Firestore;

  constructor(rootConfig: RootConfig) {
    this.cmsPlugin = getCmsPlugin(rootConfig);

    const cmsPluginOptions = this.cmsPlugin.getConfig();
    this.projectId = cmsPluginOptions.id || 'default';
    this.app = this.cmsPlugin.getFirebaseApp();
    this.db = getFirestore(this.app);
  }

  /**
   * Retrieves a doc from Root.js CMS.
   */
  async getDocData<T>(
    collectionId: string,
    slug: string,
    options: GetDocOptions
  ): Promise<T | null> {
    const mode = options.mode;
    const modeCollection = mode === 'draft' ? 'Drafts' : 'Published';
    // Slugs with slashes are encoded as `--` in the DB.
    slug = slug.replaceAll('/', '--');
    const dbPath = `Projects/${this.projectId}/Collections/${collectionId}/${modeCollection}/${slug}`;
    const docRef = this.db.doc(dbPath);
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      return normalizeData(data) as T;
    }
    console.log(`doc not found: ${dbPath}`);
    return null;
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
      const doc = normalizeData(result.data()) as T;
      docs.push(doc);
    });
    return {docs};
  }

  /**
   * Returns the number of docs in a Root.js CMS collection.
   */
  async getCount(collectionId: string, options: GetCountOptions) {
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
export function normalizeData(data: any): any {
  const result: any = {};
  for (const key in data) {
    const val = data[key];
    if (isObject(val)) {
      if (val.toMillis) {
        result[key] = val.toMillis();
      } else if (Object.hasOwn(val, '_array') && Array.isArray(val._array)) {
        const arr = val._array.map((k: string) => normalizeData(val[k] || {}));
        result[key] = arr;
      } else {
        result[key] = normalizeData(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
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
