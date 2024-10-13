import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {logAction} from '@/db/actions.js';
import {TIME_UNITS} from './time.js';

export interface Translation {
  [locale: string]: string;
  source: string;
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
  translations: Record<string, string>
) {
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const db = window.firebase.db;
  const docRef = doc(db, 'Projects', projectId, 'Translations', hash);

  const updates: Record<string, string> = {};
  for (const key in translations) {
    const locale = normalizeLocale(key);
    if (locale) {
      updates[locale] = translations[key];
    }
  }
  console.log('updating translations: ', updates);

  await updateDoc(docRef, updates);
  logAction('translations.save', {
    metadata: {hash},
    throttle: 5 * TIME_UNITS.minute,
    throttleId: hash,
  });
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
