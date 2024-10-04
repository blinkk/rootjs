import {useEffect, useState} from 'preact/hooks';
import {
  TranslationsDoc,
  TranslationsLinkedSheet,
  TranslationsMap,
  dbGetTranslationsDoc,
  dbSaveTranslations,
} from '../db/translations.js';
import {normalizeString, sourceHash} from '../utils/l10n.js';

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
  const [translationsDoc, setTranslationsDoc] =
    useState<TranslationsDoc | null>(null);
  const [strings, setStrings] = useState<TranslationsMap>({});
  const [linkedSheet, setLinkedSheet] =
    useState<TranslationsLinkedSheet | null>(null);
  const [pendingChanges, setPendingChanges] = useState<TranslationsMap>({});
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  async function init() {
    setLoading(true);
    const translationsDoc = await dbGetTranslationsDoc(translationsId);
    setTranslationsDoc(translationsDoc);
    setStrings(translationsDoc?.strings || {});
    setLoading(false);
  }

  async function setTranslation(
    locale: string,
    source: string,
    translation: string
  ) {
    const hash = await sourceHash(source);
    setPendingChanges((oldValue) => {
      const newValue = {...oldValue};
      if (!newValue[hash]) {
        newValue[hash] = {source: normalizeString(source)};
      }
      newValue[hash][locale] = normalizeString(translation);
      return newValue;
    });
    setStrings((oldValue) => {
      const newValue = {...oldValue};
      if (!newValue[hash]) {
        newValue[hash] = {source: normalizeString(source)};
      }
      newValue[hash][locale] = normalizeString(translation);
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
    hasPendingChanges,
    pendingChanges,
    saveTranslations,
  };
}
