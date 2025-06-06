import {doc, getDoc} from 'firebase/firestore';
import * as schema from '../../core/schema.js';
import {fetchCollectionSchema} from './collection.js';
import {normalizeString} from './l10n.js';

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
  extractFields(strings, schema.fields, data.fields || {});
  return Array.from(strings);
}

export function extractFields(
  strings: Set<string>,
  fields: schema.Field[],
  data: Record<string, any>
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];
    extractField(strings, field, fieldValue);
  });
}

export function extractField(
  strings: Set<string>,
  field: schema.Field,
  fieldValue: any
) {
  if (!fieldValue) {
    return;
  }

  function addString(text: string) {
    const str = normalizeString(text);
    if (str) {
      strings.add(str);
    }
  }

  if (field.type === 'object') {
    extractFields(strings, field.fields || [], fieldValue);
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractField(strings, field.of, fieldValue[arrayKey]);
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addString(fieldValue);
    }
  } else if (field.type === 'image') {
    if (field.translate && fieldValue && fieldValue.alt) {
      addString(fieldValue.alt);
    }
  } else if (field.type === 'multiselect') {
    if (field.translate && Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        addString(value);
      }
    }
  } else if (field.type === 'oneof') {
    const types = field.types || [];
    const fieldValueType = types.find((item) => item.name === fieldValue._type);
    if (fieldValueType) {
      extractFields(strings, fieldValueType.fields || [], fieldValue);
    }
  } else if (field.type === 'richtext') {
    if (field.translate) {
      extractRichTextStrings(strings, fieldValue);
    }
  } else {
    console.log(`extract: ignoring field, id=${field.id}, type=${field.type}`);
  }
}

export function extractRichTextStrings(strings: Set<string>, data: string) {
  if (!data) {
    return;
  }
  const text = data.replace(/<[^>]+>/g, ' ');
  text
    .split(/\s+/)
    .map((str) => normalizeString(str))
    .filter(Boolean)
    .forEach((str) => strings.add(str!));
}
