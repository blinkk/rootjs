import crypto from 'node:crypto';
import {
  DocumentReference,
  FieldValue,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {extractStringsFromFields} from '../shared/extract.js';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {normalizeSlug} from '../shared/slug.js';
import {hashStr, normalizeStr} from '../shared/strings.js';
import type {RootCMSClient} from './client.js';
import type {SchemaWithTypes} from './schema.js';

const TRANSLATIONS_DB_PATH_FORMAT =
  '/Projects/{project}/TranslationsManager/{mode}/Translations';

const TRANSLATIONS_LOCALE_DOC_DB_PATH_FORMAT = `${TRANSLATIONS_DB_PATH_FORMAT}/{id}:{locale}`;

/**
 * Firestore limits `in` queries to 10 values, so larger queries are broken up
 * into chunks.
 */
const IN_QUERY_CHUNK_SIZE = 10;

/**
 * Firestore batches allow a max of 500 write ops. Use a slightly lower limit
 * to leave headroom for callers that add their own ops to a shared batch.
 */
const MAX_BATCH_OPS = 400;

/**
 * Firestore rejects commits whose request payload exceeds ~11MB, and
 * transactions (including batch commits) whose total size exceeds ~10MB. The
 * transaction size includes the index entries created by each write, which
 * for translations locale docs is much larger than the doc itself (every
 * string in the `strings` map is indexed). Batches are capped by an estimate
 * of that size (see `estimateWriteBytes()`), with plenty of headroom.
 */
const MAX_BATCH_BYTES = 4 * 1024 * 1024;

/**
 * Firestore truncates indexed string values to 1500 bytes.
 */
const MAX_INDEXED_VALUE_BYTES = 1500;

/**
 * Approximate fixed overhead per index entry, plus the length of the full
 * document name (`projects/{p}/databases/(default)/documents/...`) that's
 * stored in every index entry.
 */
const INDEX_ENTRY_OVERHEAD_BYTES = 32 + 100;

/** Max number of doc refs to read in a single `getAll()` call. */
const GET_ALL_CHUNK_SIZE = 100;

/** Max number of Firestore reads or commits to run in parallel. */
const MAX_CONCURRENT_REQUESTS = 8;

/** gRPC status codes for errors that are safe to retry. */
const RETRYABLE_GRPC_CODES = new Set([
  4, // DEADLINE_EXCEEDED
  8, // RESOURCE_EXHAUSTED
  10, // ABORTED
  14, // UNAVAILABLE
]);

/** Max number of attempts for a retryable Firestore request. */
const MAX_ATTEMPTS = 4;

/** How often to log progress while saving translations. */
const PROGRESS_LOG_INTERVAL_MS = 5000;

export type Locale = string;
export type SourceString = string;
export type TranslatedString = string;
export type TranslationsDocMode = 'draft' | 'published';

/**
 * The TranslationsLocaleDoc is the internal doc type stored in the DB. For a
 * translations doc, the translations for each locale is stored in a separate
 * doc represented by this type.
 *
 * This type is not meant to be used by external callers since this is primarily
 * an internal implementation detail.
 */
export interface TranslationsLocaleDoc {
  /**
   * Translations id. In most cases, this is the same as the doc id, e.g.
   * `Pages/foo--bar`.
   */
  id: string;
  locale: string;
  tags: string[];
  strings: TranslationsLocaleDocHashMap;
  sys: {
    modifiedAt: Timestamp;
    modifiedBy: string;
    publishedAt?: Timestamp;
    publishedBy?: string;
    linkedSheet?: TranslationsLinkedSheet;
  };
}

export interface TranslationsLinkedSheet {
  spreadsheetId: string;
  gid: number;
  linkedAt: Timestamp;
  linkedBy: string;
}

/**
 * A translations locale doc paired with its Firestore doc ref.
 */
export interface TranslationsLocaleDocWithRef {
  ref: DocumentReference;
  data: TranslationsLocaleDoc;
}

export interface TranslationsLocaleDocHashMap {
  /**
   * A hash map of a source string's hash fingerprint to the source string and
   * translated string.
   */
  [hash: string]: TranslationsLocaleDocEntry;
}

export interface TranslationsLocaleDocEntry {
  source: SourceString;
  translation: TranslatedString;
  // TODO(stevenle): in the future we should add an ability for content editors
  // to provide additional translations notes for translators.
  // context: string;
}

interface TranslationsDbPathOptions {
  project: string;
  mode: TranslationsDocMode;
}

type TranslationsLocaleDocDbPathOptions = TranslationsDbPathOptions & {
  id: string;
  locale: string;
};

/**
 * A translations map containing translations for multiple locales.
 *
 * Example:
 * ```
 * {
 *   "one": {"es": "uno", "fr": "un"},
 *   "two": {"es": "dos", "fr": "deux"}
 * }
 * ```
 */
export interface MultiLocaleTranslationsMap {
  [source: SourceString]: {
    [locale: Locale]: TranslatedString;
  };
}

/**
 * A translations map containing translations for a single locale.
 *
 * Example:
 * ```
 * {
 *   "one": "uno",
 *   "two": "dos"
 * }
 * ```
 */
export interface SingleLocaleTranslationsMap {
  [source: SourceString]: TranslatedString;
}

/**
 * Stats returned by `importTranslationsFromV1()`.
 */
export interface ImportTranslationsFromV1Result {
  /** Translations doc ids that were created or updated. */
  ids: string[];
  stats: {
    /** Number of v1 source strings imported. */
    numStrings: number;
    /** Number of v2 translations docs saved. */
    numDocs: number;
    /**
     * Number of strings removed from doc-backed translations docs because
     * the doc no longer uses them (see `getCollectionSchema` in
     * `ImportTranslationsFromV1Options`).
     */
    numPrunedStrings: number;
  };
}

/**
 * Options for `importTranslationsFromV1()`.
 */
export interface ImportTranslationsFromV1Options {
  /**
   * Publishes the imported translations in the same writes that save the
   * drafts. Defaults to `false` (drafts only).
   */
  publish?: boolean;
  /**
   * Value saved to `sys.modifiedBy` (and `sys.publishedBy`, when publishing).
   * Defaults to `root-cms v1 migration`.
   */
  modifiedBy?: string;
  /**
   * Loads a collection's schema. When provided, strings in doc-backed
   * translations docs (e.g. `Pages/index`) that are no longer used by any
   * version of the doc are pruned instead of imported. The v1 data isn't
   * modified, so pruned strings can still be recovered from it.
   */
  getCollectionSchema?: (
    collectionId: string
  ) => Promise<SchemaWithTypes | null>;
  /**
   * Tracks locale docs that were already saved, so that a retry after a
   * failed import skips them.
   */
  writeCache?: TranslationsWriteCache;
}

/**
 * Stores the cache keys of translations locale docs that have been saved.
 * Keys are content hashes, so a locale doc whose strings changed since it was
 * saved is written again.
 */
export interface TranslationsWriteCache {
  has(key: string): boolean;
  add(keys: string[]): Promise<void>;
}

/** A doc that backs a doc-like v1 translations tag (e.g. `Pages/index`). */
interface V1TagDoc {
  /** The draft doc's linked l10n sheet. */
  linkedSheet?: TranslationsLinkedSheet;
  /** The `fields` of each existing version of the doc. */
  fields: Record<string, any>[];
}

/** A pending write of a translations locale doc. */
interface LocaleDocWrite {
  draftPath: string;
  /** Set when the locale doc should also be published. */
  publishedPath?: string;
  data: {
    id: string;
    locale: string;
    strings: TranslationsLocaleDocHashMap;
    sys: Record<string, any>;
  };
  /** Content hash used to skip writes saved by a previous run. */
  cacheKey: string;
  /** Estimated transaction size of the (draft) write. */
  bytes: number;
}

export class TranslationsManager {
  cmsClient: RootCMSClient;

  constructor(cmsClient: RootCMSClient) {
    this.cmsClient = cmsClient;
  }

  /**
   * Saves draft translations for a translations doc id.
   *
   * Example:
   * ```
   * const strings = {
   *   'one': {es: 'uno', fr: 'un'},
   *   'two': {es: 'dos', fr: 'deux'},
   * };
   * await tm.saveTranslations('Pages/index', strings);
   * ```
   */
  async saveTranslations(
    id: string,
    strings: MultiLocaleTranslationsMap,
    options?: {
      tags?: string[];
      modifiedBy?: string;
      linkedSheet?: TranslationsLinkedSheet;
    }
  ) {
    const mode = 'draft';
    const localesSet: Set<Locale> = new Set();
    Object.values(strings).forEach((entry) => {
      Object.keys(entry).forEach((locale) => {
        if (locale !== 'source') {
          localesSet.add(locale);
        }
      });
    });

    const db = this.cmsClient.db;
    let batch = db.batch();
    let numOps = 0;
    let numBytes = 0;
    const locales = Array.from(localesSet);
    for (const locale of locales) {
      const hashMap = this.toLocaleDocHashMap(strings, locale);
      if (Object.keys(hashMap).length === 0) {
        continue;
      }
      const localeDocPath = buildTranslationsLocaleDocDbPath({
        project: this.cmsClient.projectId,
        mode: mode,
        id: id,
        locale: locale,
      });
      const docBytes = estimateWriteBytes(localeDocPath, {strings: hashMap});
      if (numOps > 0 && numBytes + docBytes > MAX_BATCH_BYTES) {
        await batch.commit();
        batch = db.batch();
        numOps = 0;
        numBytes = 0;
      }
      const updates: Record<string, any> = {
        id: id,
        locale: locale,
        sys: {
          modifiedAt: Timestamp.now(),
          modifiedBy: options?.modifiedBy || 'root-cms-client',
        },
        strings: hashMap,
      };
      if (options?.tags && options.tags.length > 0) {
        updates.tags = FieldValue.arrayUnion(...options.tags);
      }
      if (options?.linkedSheet) {
        updates.sys.linkedSheet = options.linkedSheet;
      }
      const localeDocRef = db.doc(localeDocPath);
      batch.set(localeDocRef, updates, {merge: true});
      numOps += 1;
      numBytes += docBytes;
      if (numOps >= MAX_BATCH_OPS) {
        await batch.commit();
        batch = db.batch();
        numOps = 0;
        numBytes = 0;
      }
    }
    if (numOps > 0) {
      await batch.commit();
    }
  }

  /**
   * Publishes a translations doc.
   */
  async publishTranslations(
    id: string,
    options?: {batch?: WriteBatch; publishedBy?: string}
  ) {
    const db = this.cmsClient.db;
    const localeDocsById = await this.getTranslationsLocaleDocs([id], 'draft');
    const localeDocs = localeDocsById[id] || [];
    if (localeDocs.length === 0) {
      console.warn(`no translations to publish for ${id}`);
      return;
    }

    const batch = options?.batch || db.batch();
    this.addPublishTranslationsOps(localeDocs, batch, {
      publishedBy: options?.publishedBy,
    });

    // If a batch was provided, assume that the caller is responsible for
    // calling `batch.commit()`.
    const shouldCommitBatch = !options?.batch;
    if (shouldCommitBatch) {
      await batch.commit();
    }
  }

  /**
   * Publishes multiple translations docs by id, e.g.:
   * ```
   * await tm.publishTranslationsBulk(['Pages/index', 'common']);
   * ```
   */
  async publishTranslationsBulk(
    ids: string[],
    options?: {publishedBy?: string}
  ): Promise<{publishedIds: string[]}> {
    const db = this.cmsClient.db;
    const localeDocsById = await this.getTranslationsLocaleDocs(ids, 'draft');
    const publishedIds: string[] = [];
    let batch = db.batch();
    let numOps = 0;
    let numBytes = 0;
    const commit = async () => {
      await batch.commit();
      batch = db.batch();
      numOps = 0;
      numBytes = 0;
    };
    for (const id of Object.keys(localeDocsById)) {
      const localeDocs = localeDocsById[id];
      if (localeDocs.length === 0) {
        continue;
      }
      // Keep all of a translations doc's ops within a single commit when they
      // fit. A translations doc that exceeds the limits on its own is split
      // across multiple commits.
      const docsBytes = localeDocs.map((localeDoc) =>
        estimateWriteBytes(localeDoc.ref.path, {
          strings: localeDoc.data.strings,
        })
      );
      const totalBytes = docsBytes.reduce((a, b) => a + b, 0);
      if (
        numOps > 0 &&
        (numOps + 2 * localeDocs.length > MAX_BATCH_OPS ||
          numBytes + totalBytes > MAX_BATCH_BYTES)
      ) {
        await commit();
      }
      for (let i = 0; i < localeDocs.length; i++) {
        if (
          numOps > 0 &&
          (numOps + 2 > MAX_BATCH_OPS ||
            numBytes + docsBytes[i] > MAX_BATCH_BYTES)
        ) {
          await commit();
        }
        numOps += this.addPublishTranslationsOps(
          [localeDocs[i]],
          batch,
          options
        );
        numBytes += docsBytes[i];
      }
      publishedIds.push(id);
    }
    if (numOps > 0) {
      await batch.commit();
    }
    return {publishedIds};
  }

  /**
   * Adds the write ops for publishing a set of draft translations locale docs
   * to a batch. For each locale doc, the draft doc's `sys` is updated with
   * `publishedAt/By` and a copy is saved to the published collection. Returns
   * the number of ops added to the batch (2 per locale doc).
   */
  addPublishTranslationsOps(
    localeDocs: TranslationsLocaleDocWithRef[],
    batch: WriteBatch,
    options?: {publishedBy?: string}
  ): number {
    const db = this.cmsClient.db;
    const project = this.cmsClient.projectId;
    const publishedBy = options?.publishedBy || 'root-cms-client';
    let numOps = 0;
    for (const localeDoc of localeDocs) {
      const data = localeDoc.data;
      const sys = {
        ...data.sys,
        publishedAt: Timestamp.now(),
        publishedBy: publishedBy,
      };
      batch.update(localeDoc.ref, {sys});
      const publishedDocPath = buildTranslationsLocaleDocDbPath({
        project: project,
        mode: 'published',
        id: data.id,
        locale: data.locale,
      });
      const publishedDocRef = db.doc(publishedDocPath);
      batch.set(publishedDocRef, {...data, sys});
      numOps += 2;
    }
    return numOps;
  }

  /**
   * Fetches the translations locale docs (with their doc refs) for a set of
   * translations doc ids, grouped by id.
   */
  async getTranslationsLocaleDocs(
    ids: string[],
    mode: TranslationsDocMode
  ): Promise<Record<string, TranslationsLocaleDocWithRef[]>> {
    const localeDocsById: Record<string, TranslationsLocaleDocWithRef[]> = {};
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      return localeDocsById;
    }
    const dbPath = buildTranslationsDbPath({
      project: this.cmsClient.projectId,
      mode: mode,
    });
    const collectionRef = this.cmsClient.db.collection(dbPath);
    const snapshots = await Promise.all(
      chunkArray(uniqueIds, IN_QUERY_CHUNK_SIZE).map((chunk) =>
        collectionRef.where('id', 'in', chunk).get()
      )
    );
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as TranslationsLocaleDoc;
        localeDocsById[data.id] ??= [];
        localeDocsById[data.id].push({ref: doc.ref, data});
      });
    });
    return localeDocsById;
  }

  /**
   * Fetches translations from one or more translations docs in the translations
   * manager.
   *
   * Example:
   * ```
   * await tm.loadTranslations();
   * // =>
   * // {
   * //   "one": {"es": "uno", "fr": "un"},
   * //   "two": {"es": "dos", "fr": "deux"}
   * // }
   * ```
   *
   * To load a specific set of translations docs by id:
   * ```
   * const translationsToLoad = ['Global/strings', 'Global/header', 'Global/footer', 'Pages/index'];
   * await tm.loadTranslations({ids: translationsToLoad});
   * // =>
   * // {
   * //   "one": {"es": "uno", "fr": "un"},
   * //   "two": {"es": "dos", "fr": "deux"}
   * // }
   * ```
   *
   * To load a subset of locales (more performant):
   * ```
   * await tm.loadTranslations({locales: ['es']});
   * // =>
   * // {
   * //   "one": {"es": "uno"},
   * //   "two": {"es": "dos"}
   * // }
   * ```
   */
  async loadTranslations(options?: {
    ids?: string[];
    tags?: string[];
    locales?: Locale[];
    mode?: TranslationsDocMode;
  }): Promise<MultiLocaleTranslationsMap> {
    const mode = options?.mode || 'published';
    const dbPath = buildTranslationsDbPath({
      project: this.cmsClient.projectId,
      mode: mode,
    });
    const collectionRef = this.cmsClient.db.collection(dbPath);

    const ids = options?.ids || [];
    const tags = options?.tags || [];
    const locales = options?.locales || [];

    let localeDocs: TranslationsLocaleDoc[];
    if (ids.length > 0) {
      // Chunk the `in` query (Firestore limits `in` filters to 10 values) and
      // run the chunks in parallel. Any tags/locales filters are applied in
      // memory to avoid combining disjunctive filters in a single query.
      const snapshots = await Promise.all(
        chunkArray(ids, IN_QUERY_CHUNK_SIZE).map((chunk) =>
          collectionRef.where('id', 'in', chunk).get()
        )
      );
      localeDocs = snapshots.flatMap((snapshot) =>
        snapshot.docs.map((doc) => doc.data() as TranslationsLocaleDoc)
      );
      if (tags.length > 0) {
        localeDocs = localeDocs.filter((localeDoc) =>
          (localeDoc.tags || []).some((tag) => tags.includes(tag))
        );
      }
      if (locales.length > 0) {
        localeDocs = localeDocs.filter((localeDoc) =>
          locales.includes(localeDoc.locale)
        );
      }
      // Merge the results in `ids` order so that precedence is deterministic,
      // e.g. for `{ids: ['common', 'Pages/index']}` the doc-specific
      // translations take precedence over the generic ones.
      const idOrder = new Map(ids.map((id, i) => [id, i]));
      localeDocs.sort(
        (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0)
      );
    } else {
      let query = collectionRef as Query;
      if (tags.length > 0) {
        query = query.where('tags', 'array-contains-any', tags);
      }
      if (locales.length > 0) {
        query = query.where('locale', 'in', locales);
      }
      const results = await query.get();
      localeDocs = results.docs.map(
        (doc) => doc.data() as TranslationsLocaleDoc
      );
    }

    const strings: MultiLocaleTranslationsMap = {};
    localeDocs.forEach((localeDoc) => {
      Object.values(localeDoc.strings || {}).forEach((item) => {
        strings[item.source] ??= {source: item.source};
        if (item.translation) {
          strings[item.source][localeDoc.locale] = item.translation;
        }
      });
    });
    return strings;
  }

  /**
   * Fetches translations for a given locale, with optional fallbacks.
   * The return value is a map of source string to translated string.
   *
   * If no `fallbackLocales` are provided, the fallback chain is resolved from
   * the project's `i18n.fallbacks` config.
   *
   * Example:
   * ```
   * await translationsDoc.loadTranslationsForLocale('es');
   * // =>
   * // {
   * //   "one": "uno",
   * //   "two": "dos",
   * // }
   * ```
   */
  async loadTranslationsForLocale(
    locale: Locale,
    options?: {mode?: TranslationsDocMode; fallbackLocales?: Locale[]}
  ): Promise<SingleLocaleTranslationsMap> {
    const localeSet: Set<Locale> = new Set([
      locale,
      ...(options?.fallbackLocales ||
        resolveLocaleFallbacks(this.cmsClient.rootConfig.i18n, locale)),
    ]);
    const fallbackLocales = Array.from(localeSet);
    const multiLocaleStrings = await this.loadTranslations({
      mode: options?.mode,
      locales: fallbackLocales,
    });
    return translationsForLocaleV2(multiLocaleStrings, fallbackLocales);
  }

  /**
   * Converts a multi-locale translations map to a single-locale hashed version,
   * used for storage in in the DB.
   *
   * ```
   * const multiLocaleStrings = {
   *   'one': {es: 'uno', fr: 'un'},
   *   'two': {es: 'dos', fr: 'deux'}
   * };
   * translationsDoc.toLocaleDocHashMap(multiLocaleStrings, 'es');
   * // =>
   * // {
   * //   "<hash1>": {"source": "one", "translation": "uno"},
   * //   "<hash2>": {"source": "two", "translation": "dos"},
   * // }
   * ```
   *
   * One reason for using hashes is because the DB has limits on the number of
   * chars that can be used as the "key" in a object map.
   */
  private toLocaleDocHashMap(
    multiLocaleStrings: MultiLocaleTranslationsMap,
    locale: Locale
  ): TranslationsLocaleDocHashMap {
    const hashMap: TranslationsLocaleDocHashMap = {};
    Object.entries(multiLocaleStrings).forEach(([source, translations]) => {
      const translation = translations[locale];
      if (translation) {
        const hash = hashStr(source);
        hashMap[hash] = {source, translation};
      }
    });
    return hashMap;
  }

  /**
   * Imports translations from the v1 system to the TranslationsManager.
   *
   * Each v1 string is grouped into a v2 translations doc per tag (e.g. a
   * string tagged `Pages/index` is saved to the `Pages/index` translations
   * doc). Untagged strings are grouped into a `v1-untagged` doc so that
   * nothing is dropped. By default, the imported translations are saved as
   * drafts; use `publishTranslationsBulk()` to publish them, or pass
   * `{publish: true}` to publish them as part of the import.
   *
   * See `ImportTranslationsFromV1Options` for pruning unused strings and
   * resuming a previously failed import.
   */
  async importTranslationsFromV1(
    options: ImportTranslationsFromV1Options = {}
  ): Promise<ImportTranslationsFromV1Result> {
    const projectId = this.cmsClient.projectId;
    const db = this.cmsClient.db;
    const dbPath = `Projects/${projectId}/Translations`;
    const query = db.collection(dbPath);
    const querySnapshot = await query.get();
    const stats = {numStrings: 0, numDocs: 0, numPrunedStrings: 0};
    if (querySnapshot.size === 0) {
      return {ids: [], stats};
    }

    console.log(
      '[root cms] importing v1 Translations to v2 TranslationsManager'
    );

    const translationsDocs: Record<
      string,
      {id: string; strings: MultiLocaleTranslationsMap}
    > = {};
    querySnapshot.forEach((doc) => {
      const translation = doc.data();
      const source = this.cmsClient.normalizeString(translation.source || '');
      if (!source) {
        return;
      }
      // Collect the locale values, ignoring metadata keys and any non-string
      // values.
      const localeValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(translation)) {
        if (key === 'source' || key === 'tags') {
          continue;
        }
        if (typeof value !== 'string' || !value) {
          continue;
        }
        localeValues[key] = value;
      }
      // Group the string into a translations doc per tag. Untagged strings
      // are grouped into a `v1-untagged` doc so that nothing is dropped.
      const tags = (translation.tags || []) as string[];
      const translationsIds = tags.length > 0 ? tags : ['v1-untagged'];
      for (const translationsId of translationsIds) {
        translationsDocs[translationsId] ??= {
          id: translationsId,
          strings: {},
        };
        translationsDocs[translationsId].strings[source] = localeValues;
      }
      stats.numStrings += 1;
    });

    const ids = Object.keys(translationsDocs);
    if (ids.length === 0) {
      console.log('[root cms] no v1 translations to save');
      return {ids: [], stats};
    }

    // Fetch the docs backing doc-like translations ids (e.g. `Pages/index`)
    // in bulk, for their linked sheets and (when pruning) their strings.
    const pruneUnusedStrings = Boolean(options.getCollectionSchema);
    const tagDocs = await this.fetchV1TagDocs(ids, {
      withFields: pruneUnusedStrings,
    });
    if (options.getCollectionSchema) {
      stats.numPrunedStrings = await this.pruneUnusedV1Strings(
        translationsDocs,
        tagDocs,
        options.getCollectionSchema
      );
    }

    const publish = Boolean(options.publish);
    const modifiedBy = options.modifiedBy || 'root-cms v1 migration';
    const now = Timestamp.now();
    const writes: LocaleDocWrite[] = [];
    const savedIds: string[] = [];
    for (const translationsId of ids) {
      const strings = translationsDocs[translationsId].strings;
      const linkedSheet = tagDocs.get(translationsId)?.linkedSheet;
      let numLocaleDocs = 0;
      for (const locale of getLocales(strings)) {
        const hashMap = this.toLocaleDocHashMap(strings, locale);
        if (Object.keys(hashMap).length === 0) {
          continue;
        }
        const sys: Record<string, any> = {modifiedAt: now, modifiedBy};
        if (linkedSheet) {
          sys.linkedSheet = linkedSheet;
        }
        if (publish) {
          sys.publishedAt = now;
          sys.publishedBy = modifiedBy;
        }
        const pathOptions = {
          project: projectId,
          id: translationsId,
          locale: locale,
        };
        const draftPath = buildTranslationsLocaleDocDbPath({
          ...pathOptions,
          mode: 'draft',
        });
        writes.push({
          draftPath: draftPath,
          publishedPath: publish
            ? buildTranslationsLocaleDocDbPath({
                ...pathOptions,
                mode: 'published',
              })
            : undefined,
          data: {id: translationsId, locale, strings: hashMap, sys},
          cacheKey: sha1(
            JSON.stringify([
              translationsId,
              locale,
              publish,
              linkedSheet,
              hashMap,
            ])
          ),
          bytes: estimateWriteBytes(draftPath, {strings: hashMap}),
        });
        numLocaleDocs += 1;
      }
      if (numLocaleDocs > 0) {
        savedIds.push(translationsId);
      }
    }

    console.log(
      `[root cms] saving ${stats.numStrings} v1 string(s) to ` +
        `${savedIds.length} translations doc(s) (${writes.length} locale doc(s))`
    );
    await this.commitLocaleDocWrites(writes, {
      writeCache: options.writeCache,
    });
    stats.numDocs = savedIds.length;
    return {ids: savedIds, stats};
  }

  /**
   * Fetches the CMS docs backing doc-like translations ids (e.g. `Pages/index`
   * -> `Collections/Pages/{mode}/index`) using batched reads. Ids that don't
   * match an existing doc are omitted from the result.
   */
  private async fetchV1TagDocs(
    ids: string[],
    options: {withFields: boolean}
  ): Promise<Map<string, V1TagDoc>> {
    const db = this.cmsClient.db;
    const projectId = this.cmsClient.projectId;
    // The linked sheet is read from the draft doc. Pruning also needs the
    // fields of the published and scheduled versions.
    const modes = options.withFields
      ? ['Drafts', 'Published', 'Scheduled']
      : ['Drafts'];
    const lookups: Array<{id: string; mode: string; ref: DocumentReference}> =
      [];
    for (const id of ids) {
      const sepIndex = id.indexOf('/');
      if (sepIndex <= 0) {
        continue;
      }
      const collectionId = id.slice(0, sepIndex);
      const slug = normalizeSlug(id.slice(sepIndex + 1));
      if (!slug || Buffer.byteLength(slug, 'utf8') > 1500) {
        continue;
      }
      for (const mode of modes) {
        try {
          const ref = db.doc(
            `Projects/${projectId}/Collections/${collectionId}/${mode}/${slug}`
          );
          lookups.push({id, mode, ref});
        } catch {
          // Tags are user-defined and may look like a doc id without being a
          // valid doc path. Ignore them.
        }
      }
    }

    const results = new Map<string, V1TagDoc>();
    const readOptions = options.withFields
      ? undefined
      : {fieldMask: ['sys.l10nSheet']};
    await runWithConcurrency(
      chunkArray(lookups, GET_ALL_CHUNK_SIZE),
      MAX_CONCURRENT_REQUESTS,
      async (chunk) => {
        const refs = chunk.map((lookup) => lookup.ref);
        const snapshots = await withRetries(() =>
          readOptions ? db.getAll(...refs, readOptions) : db.getAll(...refs)
        );
        snapshots.forEach((snapshot, i) => {
          if (!snapshot.exists) {
            return;
          }
          const {id, mode} = chunk[i];
          const data = snapshot.data() || {};
          const result = results.get(id) || {fields: []};
          if (mode === 'Drafts') {
            result.linkedSheet = data.sys?.l10nSheet;
          }
          if (options.withFields) {
            result.fields.push(data.fields || {});
          }
          results.set(id, result);
        });
      }
    );
    return results;
  }

  /**
   * Removes strings from doc-backed translations docs (e.g. `Pages/index`)
   * that are no longer used by any version (draft, published or scheduled) of
   * the doc. If the doc no longer exists, all of its strings are removed.
   * Translations ids that don't map to a collection are left untouched.
   * Returns the number of strings removed.
   */
  private async pruneUnusedV1Strings(
    translationsDocs: Record<string, {strings: MultiLocaleTranslationsMap}>,
    tagDocs: Map<string, V1TagDoc>,
    getCollectionSchema: (
      collectionId: string
    ) => Promise<SchemaWithTypes | null>
  ): Promise<number> {
    const schemas = new Map<string, Promise<SchemaWithTypes | null>>();
    const loadSchema = (collectionId: string) => {
      if (!schemas.has(collectionId)) {
        schemas.set(
          collectionId,
          getCollectionSchema(collectionId).catch(() => null)
        );
      }
      return schemas.get(collectionId)!;
    };

    let numPruned = 0;
    for (const [translationsId, translationsDoc] of Object.entries(
      translationsDocs
    )) {
      const sepIndex = translationsId.indexOf('/');
      if (sepIndex <= 0) {
        continue;
      }
      const schema = await loadSchema(translationsId.slice(0, sepIndex));
      if (!schema) {
        continue;
      }
      const usedStrings = new Set<string>();
      for (const fields of tagDocs.get(translationsId)?.fields || []) {
        extractStringsFromFields(schema, fields).forEach((str) =>
          usedStrings.add(str)
        );
      }
      for (const source of Object.keys(translationsDoc.strings)) {
        if (!usedStrings.has(normalizeStr(source))) {
          delete translationsDoc.strings[source];
          numPruned += 1;
        }
      }
    }
    if (numPruned > 0) {
      console.log(
        `[root cms] pruned ${numPruned} unused v1 string(s) from doc translations`
      );
    }
    return numPruned;
  }

  /**
   * Writes translations locale docs (and their published copies, if any),
   * grouping them into batches that stay within Firestore's limits and
   * committing several batches in parallel. Writes found in `writeCache` are
   * skipped, and committed writes are added to it.
   */
  private async commitLocaleDocWrites(
    writes: LocaleDocWrite[],
    options: {writeCache?: TranslationsWriteCache}
  ) {
    const db = this.cmsClient.db;
    const writeCache = options.writeCache;
    const pending = writeCache
      ? writes.filter((write) => !writeCache.has(write.cacheKey))
      : writes;
    if (pending.length < writes.length) {
      console.log(
        `[root cms] skipping ${writes.length - pending.length} locale doc(s) ` +
          'saved by a previous run'
      );
    }

    // Group the writes into batches.
    const batches: LocaleDocWrite[][] = [];
    let batch: LocaleDocWrite[] = [];
    let numOps = 0;
    let numBytes = 0;
    for (const write of pending) {
      const writeOps = write.publishedPath ? 2 : 1;
      const writeBytes = write.bytes * writeOps;
      if (
        batch.length > 0 &&
        (numOps + writeOps > MAX_BATCH_OPS ||
          numBytes + writeBytes > MAX_BATCH_BYTES)
      ) {
        batches.push(batch);
        batch = [];
        numOps = 0;
        numBytes = 0;
      }
      batch.push(write);
      numOps += writeOps;
      numBytes += writeBytes;
    }
    if (batch.length > 0) {
      batches.push(batch);
    }

    let numWritten = 0;
    let lastLogTime = Date.now();
    await runWithConcurrency(
      batches,
      MAX_CONCURRENT_REQUESTS,
      async (items) => {
        await withRetries(() => {
          const writeBatch = db.batch();
          for (const item of items) {
            const data = {
              ...item.data,
              tags: FieldValue.arrayUnion(item.data.id),
            };
            writeBatch.set(db.doc(item.draftPath), data, {merge: true});
            if (item.publishedPath) {
              writeBatch.set(db.doc(item.publishedPath), data, {merge: true});
            }
          }
          return writeBatch.commit();
        });
        if (writeCache) {
          await writeCache.add(items.map((item) => item.cacheKey));
        }
        numWritten += items.length;
        if (Date.now() - lastLogTime > PROGRESS_LOG_INTERVAL_MS) {
          lastLogTime = Date.now();
          console.log(
            `[root cms] saved ${numWritten}/${pending.length} locale doc(s)`
          );
        }
      }
    );
  }
}

/**
 * Converts a multi-locale translations map to a flat single-locale map using
 * a locale fallback chain. For each source string, the first locale in the
 * chain with a non-empty translation wins; if no locale matches, the source
 * string is returned.
 *
 * ```
 * const multiLocaleStrings = {
 *   'one': {'en-GB': 'one!', es: 'uno'},
 *   'two': {es: 'dos'}
 * };
 * translationsForLocaleV2(multiLocaleStrings, ['en-CA', 'en-GB', 'en']);
 * // =>
 * // {
 * //   "one": "one!",
 * //   "two": "two",
 * // }
 * ```
 */
export function translationsForLocaleV2(
  multiLocaleStrings: MultiLocaleTranslationsMap,
  fallbackLocales: Locale[]
): SingleLocaleTranslationsMap {
  const singleLocaleStrings: SingleLocaleTranslationsMap = {};
  Object.entries(multiLocaleStrings).forEach(([source, translations]) => {
    let translation = source;
    for (const locale of fallbackLocales) {
      if (translations[locale]) {
        translation = translations[locale];
        break;
      }
    }
    singleLocaleStrings[source] = translation;
  });
  return singleLocaleStrings;
}

export function buildTranslationsDbPath(options: TranslationsDbPathOptions) {
  return TRANSLATIONS_DB_PATH_FORMAT.replace(
    '{project}',
    options.project
  ).replace('{mode}', options.mode);
}

export function buildTranslationsLocaleDocDbPath(
  options: TranslationsLocaleDocDbPathOptions
) {
  return TRANSLATIONS_LOCALE_DOC_DB_PATH_FORMAT.replace(
    '{project}',
    options.project
  )
    .replace('{mode}', options.mode)
    .replace('{id}', normalizeSlug(options.id))
    .replace('{locale}', options.locale);
}

/**
 * Splits an array into chunks of (up to) a given size.
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Returns the approximate size (in bytes) that writing a doc adds to a
 * Firestore transaction: the stored field values plus an ascending and a
 * descending single-field index entry for every leaf value.
 */
function estimateWriteBytes(docPath: string, data: unknown): number {
  const docPathBytes = Buffer.byteLength(docPath, 'utf8');
  let total = docPathBytes;
  const visit = (value: unknown, fieldPathBytes: number) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) {
        const keyBytes = Buffer.byteLength(key, 'utf8') + 1;
        total += keyBytes;
        visit(child, fieldPathBytes + keyBytes);
      }
      return;
    }
    const valueBytes = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
    total += valueBytes;
    const indexEntryBytes =
      INDEX_ENTRY_OVERHEAD_BYTES +
      docPathBytes +
      fieldPathBytes +
      Math.min(valueBytes, MAX_INDEXED_VALUE_BYTES);
    total += 2 * indexEntryBytes;
  };
  visit(data, 0);
  return total;
}

/**
 * Returns the locales with translations in a multi-locale translations map.
 */
function getLocales(strings: MultiLocaleTranslationsMap): Locale[] {
  const locales = new Set<Locale>();
  Object.values(strings).forEach((entry) => {
    Object.keys(entry).forEach((locale) => {
      if (locale !== 'source') {
        locales.add(locale);
      }
    });
  });
  return Array.from(locales);
}

function sha1(str: string): string {
  return crypto.createHash('sha1').update(str).digest('hex');
}

/**
 * Runs `fn` for each item, with at most `limit` calls in flight at a time.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await fn(item);
    }
  };
  const numWorkers = Math.min(limit, items.length);
  await Promise.all(Array.from({length: numWorkers}, worker));
}

/**
 * Calls `fn`, retrying with exponential backoff when it fails with a
 * transient Firestore error.
 */
async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as {code?: unknown})?.code;
      const retryable =
        typeof code === 'number' && RETRYABLE_GRPC_CODES.has(code);
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw err;
      }
      const delayMs = 2 ** attempt * 500 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
