import {doc, getDoc} from 'firebase/firestore';
import * as schema from '../../core/schema.js';
import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
  RichTextTableRow,
} from '../../shared/richtext.js';
import {fetchCollectionSchema} from './collection.js';
import {normalizeString} from './l10n.js';
import {isObject} from './objects.js';

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

export async function extractStringsWithMetadataForDoc(docId: string) {
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
  const stringsWithMeta = new Map<string, {description?: string}>();
  extractFieldsWithMetadata(
    stringsWithMeta,
    schema.fields,
    data.fields || {},
    schema.types || {}
  );
  return stringsWithMeta;
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

    // Check if field has "do not translate" metadata
    const metadataKey = `@${field.id}`;
    const metadata = data[metadataKey];
    if (metadata?.disableTranslations) {
      return; // Skip this field
    }

    extractField(strings, field, fieldValue, types);
  });
}

export function extractFieldsWithMetadata(
  stringsWithMeta: Map<string, {description?: string}>,
  fields: schema.Field[],
  data: Record<string, any>,
  types: Record<string, schema.Schema> = {}
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];

    // Check if field has "do not translate" metadata
    const metadataKey = `@${field.id}`;
    const metadata = data[metadataKey];
    if (metadata?.disableTranslations) {
      return; // Skip this field
    }

    const description = metadata?.description;
    extractFieldWithMetadata(
      stringsWithMeta,
      field,
      fieldValue,
      types,
      description
    );
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

export function extractFieldWithMetadata(
  stringsWithMeta: Map<string, {description?: string}>,
  field: schema.Field,
  fieldValue: any,
  types: Record<string, schema.Schema> = {},
  description?: string
) {
  if (!fieldValue) {
    return;
  }

  function addStringWithMeta(text: string) {
    const str = normalizeString(text);
    if (str) {
      const existing = stringsWithMeta.get(str);
      if (!existing || !existing.description) {
        stringsWithMeta.set(str, {description: description});
      }
    }
  }

  if (field.type === 'object') {
    extractFieldsWithMetadata(
      stringsWithMeta,
      field.fields || [],
      fieldValue,
      types
    );
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractFieldWithMetadata(
        stringsWithMeta,
        field.of,
        fieldValue[arrayKey],
        types,
        description
      );
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addStringWithMeta(fieldValue);
    }
  } else if (field.type === 'image') {
    if (
      field.translate &&
      fieldValue &&
      fieldValue.alt &&
      field.alt !== false
    ) {
      addStringWithMeta(fieldValue.alt);
    }
  } else if (field.type === 'multiselect') {
    if (field.translate && Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        addStringWithMeta(value);
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
      extractFieldsWithMetadata(
        stringsWithMeta,
        fieldValueType.fields || [],
        fieldValue,
        types
      );
    }
  } else if (field.type === 'richtext') {
    if (field.translate) {
      // For richtext, we still use the simple extraction without metadata
      const strings = new Set<string>();
      extractRichTextStrings(strings, fieldValue);
      strings.forEach((str) => addStringWithMeta(str));
    }
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

function extractBlockStrings(strings: Set<string>, block: RichTextBlock) {
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

  function addComponentStrings(components?: Record<string, any>) {
    if (!components) {
      return;
    }
    Object.values(components).forEach((component) => {
      collectComponentStrings(component);
    });
  }

  function collectComponentStrings(value: any) {
    if (typeof value === 'string') {
      addString(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectComponentStrings(item));
      return;
    }
    if (isObject(value)) {
      Object.values(value).forEach((item) => collectComponentStrings(item));
    }
  }

  function extractList(items?: RichTextListItem[]) {
    if (!items) {
      return;
    }
    items.forEach((item) => {
      addString(item.content);
      addComponentStrings(item.components);
      extractList(item.items);
    });
  }

  if (block.type === 'heading' || block.type === 'paragraph') {
    addString(block.data?.text);
    addComponentStrings(block.data?.components);
  } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
    extractList(block.data?.items);
  } else if (block.type === 'html') {
    addString(block.data?.html);
  } else if (block.type === 'table') {
    // Extract strings from table cells
    const rows = block.data?.rows || [];
    rows.forEach((row: RichTextTableRow) => {
      const cells = row.cells || [];
      cells.forEach((cell) => {
        // Each cell contains an array of blocks
        const cellBlocks = cell.blocks || [];
        cellBlocks.forEach((cellBlock) => {
          extractBlockStrings(strings, cellBlock);
        });
      });
    });
  }
}
