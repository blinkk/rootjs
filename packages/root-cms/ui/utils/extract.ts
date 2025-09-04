import {doc, getDoc} from 'firebase/firestore';
import * as schema from '../../core/schema.js';
import {RichTextData} from '../components/RichTextEditor/RichTextEditor.js';
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
  extractFields(strings, schema.fields, data.fields || {}, schema.types || {});
  return Array.from(strings);
}

export function extractFields(
  strings: Set<string>,
  fields: schema.Field[],
  data: Record<string, any>,
  types: Record<string, schema.Schema> = {}
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];
    extractField(strings, field, fieldValue, types);
  });
}

export function extractField(
  strings: Set<string>,
  field: schema.Field,
  fieldValue: any,
  types: Record<string, schema.Schema> = {}
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
    extractFields(strings, field.fields || [], fieldValue, types);
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractField(strings, field.of, fieldValue[arrayKey], types);
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addString(fieldValue);
    }
  } else if (field.type === 'image') {
    if (
      field.translate &&
      fieldValue &&
      fieldValue.alt &&
      field.alt !== false
    ) {
      addString(fieldValue.alt);
    }
  } else if (field.type === 'multiselect') {
    if (field.translate && Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        addString(value);
      }
    }
  } else if (field.type === 'oneof') {
    const fieldTypes = field.types || [];
    let fieldValueType: any;
    if (typeof fieldTypes[0] === 'string') {
      if ((fieldTypes as string[]).includes(fieldValue._type)) {
        fieldValueType = types[fieldValue._type];
      }
    } else {
      fieldValueType = (fieldTypes as any[]).find(
        (item: any) => item.name === fieldValue._type
      );
    }
    if (fieldValueType) {
      extractFields(strings, fieldValueType.fields || [], fieldValue, types);
    }
  } else if (field.type === 'richtext') {
    if (field.translate) {
      extractRichTextStrings(strings, fieldValue);
    }
  } else {
    console.log(`extract: ignoring field, id=${field.id}, type=${field.type}`);
  }
}

export function extractRichTextStrings(
  strings: Set<string>,
  data: RichTextData
) {
  const blocks = data?.blocks || [];
  blocks.forEach((block) => {
    extractBlockStrings(strings, block);
  });
}

interface ListItemData {
  content?: string;
  items?: ListItemData[];
}

function extractBlockStrings(strings: Set<string>, block: any) {
  if (!block?.type) {
    return;
  }

  function addString(text?: string) {
    if (!text) {
      return;
    }
    const str = normalizeString(text);
    if (str) {
      strings.add(str);
    }
  }

  function extractList(items?: ListItemData[]) {
    if (!items) {
      return;
    }
    items.forEach((item) => {
      addString(item.content);
      extractList(item.items);
    });
  }

  if (block.type === 'heading' || block.type === 'paragraph') {
    addString(block.data?.text);
  } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
    extractList(block.data?.items);
  } else if (block.type === 'html') {
    addString(block.data?.html);
  }
}
