import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
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
    const locale = normalizeLocale(key);
    if (locale) {
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

/**
 * Removes specific tags from multiple translations.
 *
 * Uses Firestore arrayRemove for safe concurrent removal.
 */
export async function batchRemoveTags(
  hashes: string[],
  tagsToRemove: string[]
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;

  // Firestore batch limit is 500.
  const batchSize = 500;
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = hashes.slice(i, i + batchSize);
    chunk.forEach((hash) => {
      const docRef = doc(db, 'Projects', projectId, 'Translations', hash);
      batch.update(docRef, {tags: arrayRemove(...tagsToRemove)});
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
        const normalized = normalizeLocale(locale);
        if (normalized) {
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
