import {getDoc} from 'firebase/firestore';
import {getDraftDocRef} from './doc.js';

const DOC_CACHE: Map<string, any> = new Map();

/**
 * Tracks in-flight fetches so that concurrent requests for the same doc share a
 * single network call. Without this, multiple fields that reference the same
 * source doc would each issue their own fetch before the cache is populated.
 */
const PENDING_FETCHES: Map<string, Promise<any>> = new Map();

export function getDocFromCache(docId: string) {
  return DOC_CACHE.get(docId) || null;
}

export async function getDocFromCacheOrFetch(docId: string) {
  const cachedValue = getDocFromCache(docId);
  if (cachedValue) {
    return cachedValue;
  }
  const pending = PENDING_FETCHES.get(docId);
  if (pending) {
    return pending;
  }
  const fetchPromise = (async () => {
    const docRef = getDraftDocRef(docId);
    const snapshot = await getDoc(docRef);
    const data = snapshot.data();
    setDocToCache(docId, data);
    return data;
  })().finally(() => {
    PENDING_FETCHES.delete(docId);
  });
  PENDING_FETCHES.set(docId, fetchPromise);
  return fetchPromise;
}

export function setDocToCache(docId: string, data: any) {
  DOC_CACHE.set(docId, data);
}

export function removeDocFromCache(docId: string) {
  DOC_CACHE.delete(docId);
  PENDING_FETCHES.delete(docId);
}

export function removeDocsFromCache(docIds: string[]) {
  for (const docId of docIds) {
    removeDocFromCache(docId);
  }
}
