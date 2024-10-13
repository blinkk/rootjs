import {useEffect, useState} from 'preact/hooks';
import {
  TranslationsLinkedSheet,
  TranslationsMap,
  dbGetTranslationsDoc,
  dbSaveTranslations,
} from '@/db/translations.js';
import {extractStringsForDoc} from '@/utils/extract.js';
import {normalizeString, sourceHash} from '@/utils/l10n.js';

export interface TranslationsDocController {
  id: string;
  loading: boolean;
  strings: TranslationsMap;
  linkedSheet: TranslationsLinkedSheet | null;
  setTranslation: (
    locale: string,
    source: string,
    translation: string
  ) => Promise<void>;
  importTranslations: (strings: TranslationsMap) => void;
  hasPendingChanges: boolean;
  pendingChanges: TranslationsMap;
  saveTranslations: () => Promise<void>;
  unlinkSheet: () => Promise<void>;
}

/**
 * Hook that fetches a translations doc and provides utility methods for
 * updating the translations and configurations.
 */
export function useTranslationsDoc(
  translationsId: string
): TranslationsDocController {
  const [loading, setLoading] = useState(true);
  const [strings, setStrings] = useState<TranslationsMap>({});
  const [linkedSheet, setLinkedSheet] =
    useState<TranslationsLinkedSheet | null>(null);
  const [pendingChanges, setPendingChanges] = useState<TranslationsMap>({});
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  async function init() {
    setLoading(true);
    const [docStrings, translationsDoc] = await Promise.all([
      getTranslationsMapForDoc(translationsId),
      dbGetTranslationsDoc(translationsId),
    ]);
    const strings = mergeTranslationsMaps(
      docStrings,
      translationsDoc?.strings || {}
    );
    setStrings(strings);
    setLoading(false);
  }

  async function setTranslation(
    locale: string,
    source: string,
    translation: string
  ) {
    const hash = await sourceHash(source);
    const strings: TranslationsMap = {
      [hash]: {
        source: normalizeString(source),
        [locale]: normalizeString(translation),
      },
    };
    importTranslations(strings);
  }

  async function importTranslations(strings: TranslationsMap) {
    setPendingChanges((oldValue) => {
      const newValue = {...oldValue};
      Object.entries(strings).forEach(([hash, translations]) => {
        newValue[hash] = {
          ...oldValue[hash],
          ...translations,
        };
      });
      return newValue;
    });
    setStrings((oldValue) => {
      const newValue = {...oldValue};
      Object.entries(strings).forEach(([hash, translations]) => {
        newValue[hash] = {
          ...oldValue[hash],
          ...translations,
        };
      });
      return newValue;
    });
  }

  async function saveTranslations() {
    if (!hasPendingChanges) {
      return;
    }
    const newStrings = await dbSaveTranslations(translationsId, pendingChanges);
    setStrings(newStrings);
  }

  async function unlinkSheet() {
    setLinkedSheet(null);
    // TODO(stevenle): impl dbTranslationsUnlinkSheet().
  }

  useEffect(() => {
    init();
  }, [translationsId]);

  return {
    id: translationsId,
    loading,
    strings,
    linkedSheet,
    unlinkSheet,
    setTranslation,
    importTranslations,
    hasPendingChanges,
    pendingChanges,
    saveTranslations,
  };
}

async function getTranslationsMapForDoc(
  docId: string
): Promise<TranslationsMap> {
  if (!docId.includes('/') && docId.includes('--')) {
    // Replace only the first instance of '--' to '/'.
    docId = docId.replace('--', '/');
  }
  if (!docId.includes('/')) {
    return {};
  }
  const collectionId = docId.split('/')[0];
  if (!window.__ROOT_CTX.collections[collectionId]) {
    return {};
  }
  const docStrings = await extractStringsForDoc(docId);
  const translationsMap: TranslationsMap = {};
  for (const source of docStrings) {
    const hash = await sourceHash(source);
    translationsMap[hash] = {source, en: source};
  }
  return translationsMap;
}

function mergeTranslationsMaps(
  a: TranslationsMap,
  b: TranslationsMap
): TranslationsMap {
  const merged: TranslationsMap = {};
  Object.entries(a).forEach(([hash, translations]) => {
    merged[hash] = {...translations};
  });
  Object.entries(b).forEach(([hash, translations]) => {
    merged[hash] = {...merged[hash], ...translations};
  });
  return merged;
}
