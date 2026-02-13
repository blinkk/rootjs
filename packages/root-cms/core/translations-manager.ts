import {
  FieldValue,
  Query,
  Timestamp,
  WriteBatch,
} from 'firebase-admin/firestore';
import {normalizeSlug} from '../shared/slug.js';
import {hashStr} from '../shared/strings.js';
import type {RootCMSClient} from './client.js';

const TRANSLATIONS_DB_PATH_FORMAT =
  '/Projects/{project}/TranslationsManager/{mode}/Translations';

const TRANSLATIONS_LOCALE_DOC_DB_PATH_FORMAT = `${TRANSLATIONS_DB_PATH_FORMAT}/{id}:{locale}`;

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
interface TranslationsLocaleDoc {
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
    linkedSheet?: {
      spreadsheetId: string;
      gid: number;
      linkedAt: Timestamp;
      linkedBy: string;
    };
  };
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
    options?: {tags?: string[]; modifiedBy?: string}
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

    const batch = this.cmsClient.db.batch();
    const locales = Array.from(localesSet);
    locales.forEach((locale) => {
      const updates: Record<string, any> = {
        id: id,
        locale: locale,
        sys: {
          modifiedAt: Timestamp.now(),
          modifiedBy: options?.modifiedBy || 'root-cms-client',
        },
        strings: {},
      };
      if (options?.tags && options.tags.length > 0) {
        updates.tags = FieldValue.arrayUnion(...options.tags);
      }
      let numUpdates = 0;
      const hashMap = this.toLocaleDocHashMap(strings, locale);
      Object.entries(hashMap).forEach(([hash, translations]) => {
        Object.entries(translations).forEach(([locale, translation]) => {
          if (translation) {
            updates.strings[hash] ??= {};
            updates.strings[hash][locale] = translation;
            numUpdates += 1;
          }
        });
      });
      if (numUpdates > 0) {
        const localeDocPath = buildTranslationsLocaleDocDbPath({
          project: this.cmsClient.projectId,
          mode: mode,
          id: id,
          locale: locale,
        });
        const localeDocRef = this.cmsClient.db.doc(localeDocPath);
        batch.set(localeDocRef, updates, {merge: true});
      }
    });
    await batch.commit();
  }

  /**
   * Publishes a translations doc.
   */
  async publishTranslations(
    id: string,
    options?: {batch?: WriteBatch; publishedBy?: string}
  ) {
    const db = this.cmsClient.db;
    const project = this.cmsClient.projectId;
    const draftPath = buildTranslationsDbPath({project, mode: 'draft'});
    const query = db.collection(draftPath).where('id', '==', id);
    const res = await query.get();
    if (res.size === 0) {
      console.warn(`no translations to publish for ${id}`);
      return;
    }

    const batch = options?.batch || db.batch();
    res.docs.forEach((doc) => {
      const translationsLocaleDoc = doc.data() as TranslationsLocaleDoc;
      const sys = {
        ...translationsLocaleDoc.sys,
        publishedAt: Timestamp.now(),
        publishedBy: options?.publishedBy || 'root-cms-client',
      };
      batch.update(doc.ref, {sys});
      const publishedDocPath = buildTranslationsLocaleDocDbPath({
        project,
        mode: 'published',
        id: translationsLocaleDoc.id,
        locale: translationsLocaleDoc.locale,
      });
      const publishedDocRef = db.doc(publishedDocPath);
      batch.set(publishedDocRef, {...translationsLocaleDoc, sys});
    });

    // If a batch was provided, assume that the caller is responsible for
    // calling `batch.commit()`.
    const shouldCommitBatch = !options?.batch;
    if (shouldCommitBatch) {
      await batch.commit();
    }
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
  }) {
    const mode = options?.mode || 'published';
    const dbPath = buildTranslationsDbPath({
      project: this.cmsClient.projectId,
      mode: mode,
    });

    let query = this.cmsClient.db.collection(dbPath) as Query;
    if (options?.ids && options.ids.length > 0) {
      query = query.where('id', 'in', options.ids);
    }
    if (options?.tags && options.tags.length > 0) {
      query = query.where('tags', 'array-contains', options.tags);
    }
    if (options?.locales && options.locales.length > 0) {
      query = query.where('locale', 'in', options.locales);
    }

    const results = await query.get();
    const strings: MultiLocaleTranslationsMap = {};
    results.forEach((result) => {
      const localeDoc = result.data() as TranslationsLocaleDoc;
      Object.values(localeDoc.strings || {}).forEach((item) => {
        strings[item.source] ??= {source: item.source};
        strings[item.source][localeDoc.locale] = item.translation;
      });
    });
    return strings;
  }

  /**
   * Fetches translations for a given locale, with optional fallbacks.
   * The return value is a map of source string to translated string.
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
      ...(options?.fallbackLocales || []),
    ]);
    const fallbackLocales = Array.from(localeSet);
    const multiLocaleStrings = await this.loadTranslations({
      mode: options?.mode,
      locales: fallbackLocales,
    });
    return this.toSingleLocaleMap(multiLocaleStrings, fallbackLocales);
  }

  /**
   * Converts a multi-locale translations map to a flat single-locale map,
   * with optional support for fallback locales.
   *
   * ```
   * const multiLocaleStrings = {
   *   'one': {es: 'uno', fr: 'un'},
   *   'two': {es: 'dos', fr: 'deux'}
   * };
   * translationsDoc.toSingleLocaleMap(multiLocaleStrings, ['es']);
   * // =>
   * // {
   * //   "one": "uno",
   * //   "two": "dos",
   * // }
   * ```
   */
  private toSingleLocaleMap(
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
   * Import translations from the v1 system to the TranslationsManager.
   */
  async importTranslationsFromV1() {
    const projectId = this.cmsClient.projectId;
    const db = this.cmsClient.db;
    const dbPath = `Projects/${projectId}/Translations`;
    const query = db.collection(dbPath);
    const querySnapshot = await query.get();
    if (querySnapshot.size === 0) {
      return;
    }

    console.log(
      '[root cms] importing v1 Translations to v2 TranslationsManager'
    );

    const translationsDocs: Record<string, any> = {};
    querySnapshot.forEach((doc) => {
      const translation = doc.data();
      const source = this.cmsClient.normalizeString(translation.source);
      delete translation.source;
      const tags = (translation.tags || []) as string[];
      delete translation.tags;
      for (const tag of tags) {
        if (tag.includes('/')) {
          const translationsId = tag;
          translationsDocs[translationsId] ??= {
            id: translationsId,
            tags: tags,
            strings: {},
          };
          translationsDocs[translationsId].strings[source] = translation;
        }
      }
    });

    if (Object.keys(translationsDocs).length === 0) {
      console.log('[root cms] no v1 translations to save');
      return;
    }

    // Move the doc's "l10nSheet" to the translations doc's "linkedSheet".
    for (const docId in translationsDocs) {
      const [collection, slug] = docId.split('/');
      if (collection && slug) {
        const doc: any = await this.cmsClient.getDoc(collection, slug, {
          mode: 'draft',
        });
        const linkedSheet = doc?.sys?.l10nSheet;
        if (linkedSheet) {
          translationsDocs[docId].sys.linkedSheet = linkedSheet;
        }
      }
    }

    Object.entries(translationsDocs).forEach(([translationsId, data]) => {
      const len = Object.keys(data.strings).length;
      console.log(`[root cms] saving ${len} string(s) to ${translationsId}...`);
      this.saveTranslations(translationsId, data.strings, {
        tags: data.tags || [translationsId],
      });
    });
  }
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
