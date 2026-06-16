import {
  arrayUnion,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  type RootLocale,
  type TranslationLanguage,
  getLocalesForTranslationLanguage as sharedGetLocalesForTranslationLanguage,
  getTranslationForLanguage as sharedGetTranslationForLanguage,
  getTranslationLanguage as sharedGetTranslationLanguage,
  toTranslationLanguages as sharedToTranslationLanguages,
} from '../../shared/translation-languages.js';
import {logAction} from './actions.js';
import {TIME_UNITS} from './time.js';

export interface Translation {
  [locale: string]: string | string[] | undefined;
  source: string;
  tags?: string[];
}

export interface TranslationsMap {
  [hash: string]: Translation;
}

/**
 * Returns the Firestore collection where translated strings are stored.
 *
 * In Firestore, each string is stored at:
 * ```
 * /Project/<project>/Translations/<hash>
 * ```
 *
 * The doc structure for the string is something like:
 * ```
 * {"source": "Hello", "es": "Hola", "fr": "Bonjour"}
 * ```
 */
export function getTranslationsCollection() {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  return collection(db, 'Projects', projectId, 'Translations');
}

/**
 * Loads translations saved in the trasnlations collection, optionally filtered
 * by tag. Returns a map like:
 * ```
 * {
 *   "<hash>": {"source": "Hello", "es": "Hola", "fr": "Bonjour"},
 * }
 * ```
 */
export async function loadTranslations(options?: {
  tags?: string[];
}): Promise<TranslationsMap> {
  const colRef = getTranslationsCollection();
  const q = options?.tags
    ? query(colRef, where('tags', 'array-contains-any', options.tags))
    : query(colRef);
  const querySnapshot = await getDocs(q);
  const translationsMap: TranslationsMap = {};
  querySnapshot.forEach((doc) => {
    const hash = doc.id;
    translationsMap[hash] = doc.data() as Translation;
  });
  return translationsMap;
}

/**
 * Loads translations for a specific set of source-string hashes. Only the
 * matching translation docs are fetched (by id), instead of downloading the
 * project's entire translations collection. This keeps doc-scoped localization
 * UIs fast even when a project has a very large number of translated strings.
 */
export async function loadTranslationsByHashes(
  hashes: string[]
): Promise<TranslationsMap> {
  const uniqueHashes = Array.from(new Set(hashes)).filter(Boolean);
  const translationsMap: TranslationsMap = {};
  if (uniqueHashes.length === 0) {
    return translationsMap;
  }
  const colRef = getTranslationsCollection();
  // Firestore allows a maximum of 30 values per `in` query, so fetch the
  // matching docs in parallel chunks.
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueHashes.length; i += CHUNK_SIZE) {
    chunks.push(uniqueHashes.slice(i, i + CHUNK_SIZE));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      // Fetch by doc id only (not by tag) so missing-tag detection still works.
      const q = query(colRef, where(documentId(), 'in', chunk));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((doc) => {
        translationsMap[doc.id] = doc.data() as Translation;
      });
    })
  );
  return translationsMap;
}

/**
 * Fetches translations by hash.
 */
export async function getTranslationByHash(hash: string) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'Translations', hash);
  const snapshot = await getDoc(docRef);
  return snapshot.data() as Translation;
}

/**
 * Updates translations for a given hash.
 */
export async function updateTranslationByHash(
  hash: string,
  translations: Translation
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'Translations', hash);

  const updates: Partial<Translation> = {};
  for (const key in translations) {
    if (key === 'tags') {
      updates.tags = translations.tags;
      continue;
    }
    // A key may be a root locale or a translation language shared by multiple
    // root locales (e.g. `es-419` covering `es_mx` and `es_co`).
    for (const locale of getLocalesForTranslationLanguage(key)) {
      updates[locale] = translations[key];
    }
  }
  console.log('updating translations: ', updates);

  await updateDoc(docRef, updates as any);
  logAction('translations.save', {
    metadata: {hash},
    throttle: 5 * TIME_UNITS.minute,
    throttleId: hash,
  });
}

/**
 * Updates tags for multiple translations.
 *
 * @param options.mode - 'union' uses Firestore arrayUnion for additive-only
 *   updates (safe against concurrent writes). 'replace' replaces the entire
 *   tags array (needed for tag removal). Defaults to 'replace'.
 */
export async function batchUpdateTags(
  updates: Array<{hash: string; tags: string[]}>,
  options?: {mode?: 'replace' | 'union'}
) {
  const mode = options?.mode ?? 'replace';
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;

  // Firestore batch limit is 500.
  const batchSize = 500;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + batchSize);
    chunk.forEach(({hash, tags}) => {
      const docRef = doc(db, 'Projects', projectId, 'Translations', hash);
      if (mode === 'union') {
        batch.update(docRef, {tags: arrayUnion(...tags)});
      } else {
        batch.update(docRef, {tags});
      }
    });
    await batch.commit();
  }
}

/** Returns the sha1 hash for a source string. */
export async function sourceHash(str: string) {
  return sha1(normalizeString(str));
}

async function sha1(str: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

/**
 * Cleans a string that's used for translations. Performs the following:
 * - Removes any leading/trailing whitespace
 * - Removes spaces at the end of any line
 */
export function normalizeString(str: string) {
  const lines = String(str)
    .trim()
    .split('\n')
    .map((line) => removeTrailingWhitespace(line));
  return lines.join('\n');
}

function removeTrailingWhitespace(str: string) {
  return String(str)
    .trimEnd()
    .replace(/&nbsp;$/, '');
}

/**
 * Cache of compiled wildcard patterns. Imports can call
 * `isLocaleExcludedFromTranslations()` many times per row/column, so we avoid
 * recompiling the same pattern on every call.
 */
const wildcardRegExpCache = new Map<string, RegExp>();

/**
 * Converts a wildcard pattern (e.g. `ALL_*`) to a case-insensitive RegExp.
 * Supports `*` (matches any number of characters) and `?` (matches a single
 * character). Compiled regexes are memoized per pattern.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const cached = wildcardRegExpCache.get(pattern);
  if (cached) {
    return cached;
  }
  const regexStr = pattern
    // Escape regex special chars except `*` and `?`.
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regExp = new RegExp(`^${regexStr}$`, 'i');
  wildcardRegExpCache.set(pattern, regExp);
  return regExp;
}

/**
 * Returns true if a locale should be excluded from translation import/export
 * (CSV, Google Sheets, translation services), based on the
 * `excludeLocalesFromTranslations` patterns configured in the CMS plugin.
 * Patterns support wildcards, e.g. `ALL_*`.
 */
export function isLocaleExcludedFromTranslations(locale: string): boolean {
  const patterns = window.__ROOT_CTX.excludeLocalesFromTranslations || [];
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(locale));
}

export function normalizeLocale(locale: string) {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  for (const l of i18nLocales) {
    if (String(l).toLowerCase() === locale.toLowerCase()) {
      return l;
    }
  }
  // Ignore locales that are not in the root config.
  return null;
}

/**
 * Returns the "translation language" for a root locale, as configured in
 * `i18n.translationLanguages` (e.g. `es-419` for the `es_mx` locale).
 * Returns the locale itself if no mapping is configured.
 */
export function getTranslationLanguage(
  locale: RootLocale
): TranslationLanguage {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  return sharedGetTranslationLanguage(i18nConfig, locale);
}

/**
 * Converts a list of root locales to translation languages, removing
 * duplicates (multiple root locales may share a translation language) while
 * preserving order.
 */
export function toTranslationLanguages(
  locales: RootLocale[]
): TranslationLanguage[] {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  return sharedToTranslationLanguages(i18nConfig, locales);
}

/**
 * Expands a translation language (or root locale) to the root locales it
 * covers, e.g. `es-419` may return `['es_mx', 'es_co']`. Returns an
 * empty array if the value doesn't match any locale in the root config.
 */
export function getLocalesForTranslationLanguage(
  lang: TranslationLanguage | RootLocale
): RootLocale[] {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  return sharedGetLocalesForTranslationLanguage(i18nConfig, lang);
}

/**
 * Reads the translation for a translation language (or root locale) from a
 * translations map keyed by root locale, checking all root locales that
 * share the language and returning the first non-empty value.
 */
export function getTranslationForLanguage(
  translations: Record<RootLocale, unknown>,
  lang: TranslationLanguage | RootLocale
): string {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  return sharedGetTranslationForLanguage(i18nConfig, translations, lang);
}

/**
 * Batch-saves locale translations for multiple source strings without modifying
 * tags. Each entry maps a source string to its locale translations. Only the
 * provided locale keys are written (merged into existing docs).
 *
 * Used by LocalizationModal and EditTranslationsModal for inline edits.
 */
export async function batchSaveTranslations(
  edits: Array<{source: string; locales: Record<string, string>}>,
  options?: {tags?: string[]}
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const batchSize = 500;

  // Compute hashes for all sources in parallel.
  const hashEntries = await Promise.all(
    edits.map(async (edit) => ({
      hash: await sourceHash(edit.source),
      locales: edit.locales,
      source: edit.source,
    }))
  );

  for (let i = 0; i < hashEntries.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = hashEntries.slice(i, i + batchSize);
    for (const entry of chunk) {
      const docRef = doc(db, 'Projects', projectId, 'Translations', entry.hash);
      const updates: Record<string, any> = {source: entry.source};
      for (const [locale, value] of Object.entries(entry.locales)) {
        // A key may be a root locale or a translation language shared by
        // multiple root locales (e.g. `es-419` covering `es_mx`).
        for (const normalized of getLocalesForTranslationLanguage(locale)) {
          updates[normalized] = normalizeString(value);
        }
      }
      if (options?.tags?.length) {
        updates.tags = arrayUnion(...options.tags);
      }
      batch.set(docRef, updates, {merge: true});
    }
    await batch.commit();
  }

  logAction('translations.batch_save', {
    metadata: {count: edits.length},
  });
}
