import {
  DocumentReference,
  FieldValue,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {resolveLocaleFallbacks} from '../shared/locale-fallbacks.js';
import {normalizeSlug} from '../shared/slug.js';
import {hashStr} from '../shared/strings.js';
import type {RootCMSClient} from './client.js';

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
  };
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
    const locales = Array.from(localesSet);
    for (const locale of locales) {
      const hashMap = this.toLocaleDocHashMap(strings, locale);
      if (Object.keys(hashMap).length === 0) {
        continue;
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
      const localeDocPath = buildTranslationsLocaleDocDbPath({
        project: this.cmsClient.projectId,
        mode: mode,
        id: id,
        locale: locale,
      });
      const localeDocRef = db.doc(localeDocPath);
      batch.set(localeDocRef, updates, {merge: true});
      numOps += 1;
      if (numOps >= MAX_BATCH_OPS) {
        await batch.commit();
        batch = db.batch();
        numOps = 0;
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
    for (const id of Object.keys(localeDocsById)) {
      const localeDocs = localeDocsById[id];
      if (localeDocs.length === 0) {
        continue;
      }
      // Keep all of a translations doc's ops within a single commit.
      if (numOps > 0 && numOps + 2 * localeDocs.length > MAX_BATCH_OPS) {
        await batch.commit();
        batch = db.batch();
        numOps = 0;
      }
      numOps += this.addPublishTranslationsOps(localeDocs, batch, options);
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
   * nothing is dropped. The imported translations are saved as drafts; use
   * `publishTranslationsBulk()` to publish them.
   */
  async importTranslationsFromV1(): Promise<ImportTranslationsFromV1Result> {
    const projectId = this.cmsClient.projectId;
    const db = this.cmsClient.db;
    const dbPath = `Projects/${projectId}/Translations`;
    const query = db.collection(dbPath);
    const querySnapshot = await query.get();
    const stats = {numStrings: 0, numDocs: 0};
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

    for (const translationsId of ids) {
      const data = translationsDocs[translationsId];

      // For doc-backed translations ids (e.g. `Pages/index`), move the doc's
      // "l10nSheet" to the translations doc's "linkedSheet".
      let linkedSheet: TranslationsLinkedSheet | undefined;
      const sepIndex = translationsId.indexOf('/');
      if (sepIndex > 0) {
        const collection = translationsId.slice(0, sepIndex);
        const slug = translationsId.slice(sepIndex + 1);
        try {
          const rawDoc = await this.cmsClient.getRawDoc(collection, slug, {
            mode: 'draft',
          });
          linkedSheet = rawDoc?.sys?.l10nSheet;
        } catch (err) {
          // Tags are user-defined and may look like a doc id without matching
          // an actual collection. Ignore lookup errors.
          console.warn(
            `[root cms] failed to look up doc for tag "${translationsId}":`,
            String(err)
          );
        }
      }

      const numStrings = Object.keys(data.strings).length;
      console.log(
        `[root cms] saving ${numStrings} string(s) to ${translationsId}...`
      );
      await this.saveTranslations(translationsId, data.strings, {
        tags: [translationsId],
        linkedSheet: linkedSheet,
        modifiedBy: 'root-cms v1 migration',
      });
      stats.numDocs += 1;
    }
    return {ids, stats};
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
