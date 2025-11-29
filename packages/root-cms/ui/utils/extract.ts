import {doc, getDoc} from 'firebase/firestore';
import * as extract from '../../core/extract.js';
import {fetchCollectionSchema} from './collection.js';

export * from '../../core/extract.js';

const {extractFields} = extract;

export async function extractStringsForDoc(docId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [collectionId, slug] = docId.split('/', 2);
  const schema = await fetchCollectionSchema(collectionId);
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const snapshot = await getDoc(docRef);
  const data = snapshot.data() || {};
  const strings = new Set<string>();
  extractFields(strings, schema.fields, data.fields || {}, schema.types || {});
  return Array.from(strings);
}
