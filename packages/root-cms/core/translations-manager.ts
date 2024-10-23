import {
  FieldPath,
  FieldValue,
  Query,
  Timestamp,
} from 'firebase-admin/firestore';
import {murmurHash} from 'ohash';
import type {RootCMSClient} from './client.js';

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

const TRANSLATIONS_DB_PATH_FORMAT =
  '/Projects/{project}/TranslationsManager/{mode}/Translations';

const TRANSLATIONS_LOCALE_DOC_DB_PATH_FORMAT = `${TRANSLATIONS_DB_PATH_FORMAT}/{id}:{locale}`;

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
        const localeDocPath = getTranslationsLocaleDocDbPath({
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
   * Publishes a translations doc id.
   */
  async publishTranslations(id: string) {}

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
    const dbPath = getTranslationsDbPath({
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
   * translationsDoc.toSingleLocaleMap(multiLocaleStrings, ['fr']);
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
        const hash = getSourceHash(source);
        hashMap[hash] = {source, translation};
      }
    });
    return hashMap;
  }

  /**
   * Combines two locale doc hash maps.
   */
  private mergeLocaleDocHashMaps(
    a: TranslationsLocaleDocHashMap,
    b: TranslationsLocaleDocHashMap
  ): TranslationsLocaleDocHashMap {
    const results: TranslationsLocaleDocHashMap = {...a};
    Object.entries(b).forEach(([hash, translations]) => {
      results[hash] = {...results[hash], ...translations};
    });
    return results;
  }
}

function getTranslationsDbPath(options: TranslationsDbPathOptions) {
  return TRANSLATIONS_DB_PATH_FORMAT.replace(
    '{project}',
    options.project
  ).replace('{mode}', options.mode);
}

function getTranslationsLocaleDocDbPath(
  options: TranslationsLocaleDocDbPathOptions
) {
  return TRANSLATIONS_LOCALE_DOC_DB_PATH_FORMAT.replace(
    '{project}',
    options.project
  )
    .replace('{mode}', options.mode)
    .replace('{id}', options.id.replaceAll('/', '--'))
    .replace('{locale}', options.locale);
}

/**
 * Returns a hash fingerprint for a string.
 *
 * Note that this hash function is meant to be fast and for collision avoidance
 * for use in a hash map, but is not intended for cryptographic purposes. For
 * these reasons murmurhash3 is used here.
 */
export function getSourceHash(source: string): string {
  return String(murmurHash(normalizeString(source)));
}

/**
 * Cleans a source string for use in translations. Performs the following:
 * - Removes any leading/trailing whitespace
 * - Removes spaces at the end of any line
 */
export function normalizeString(source: string): string {
  const lines = String(source)
    .trim()
    .split('\n')
    .map((line) => line.trimEnd());
  return lines.join('\n');
}
