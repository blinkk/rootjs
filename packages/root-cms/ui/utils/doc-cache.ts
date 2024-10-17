import {getDoc} from 'firebase/firestore';
import {getDraftDocRef} from '@/db/docs.js';

const DOC_CACHE: Map<string, any> = new Map();

export function getDocFromCache(docId: string) {
  return DOC_CACHE.get(docId) || null;
}

export async function getDocFromCacheOrFetch(docId: string) {
  const cachedValue = getDocFromCache(docId);
  if (cachedValue) {
    return cachedValue;
  }
  const docRef = getDraftDocRef(docId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.data();
  setDocToCache(docId, data);
  return data;
}

export function setDocToCache(docId: string, data: any) {
  DOC_CACHE.set(docId, data);
}

export function removeDocFromCache(docId: string) {
  DOC_CACHE.delete(docId);
}

export function removeDocsFromCache(docIds: string[]) {
  for (const docId of docIds) {
    removeDocFromCache(docId);
  }
}
