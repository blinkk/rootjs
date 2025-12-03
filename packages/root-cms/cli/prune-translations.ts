import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import {FieldValue} from 'firebase-admin/firestore';

import {RootCMSClient} from '../core/client.js';
import type {Field, Schema} from '../core/schema.js';
import type {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
  RichTextTableRow,
} from '../shared/richtext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ProjectModule = typeof import('../core/project.js');

type NormalizeStringFn = (str: string) => string;

export async function pruneTranslations(docId: string) {
  if (!docId || !docId.includes('/')) {
    throw new Error('doc id must be in the format "<collection>/<slug>".');
  }

  const [collectionId, ...slugParts] = docId.split('/');
  const slug = slugParts.join('/');
  if (!collectionId || !slug) {
    throw new Error('doc id must include both collection and slug.');
  }

  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const cmsClient = new RootCMSClient(rootConfig);
  const normalizeString = cmsClient.normalizeString.bind(cmsClient);

  const modulePath = path.resolve(__dirname, './project.js');
  const project = (await viteSsrLoadModule(
    rootConfig,
    modulePath
  )) as ProjectModule;
  const collectionSchema = await project.getCollectionSchema(collectionId);
  if (!collectionSchema) {
    console.warn(`collection schema not found for ${collectionId}`);
    return;
  }

  const docStrings = new Set<string>();
  for (const mode of ['draft', 'published'] as const) {
    const doc = await cmsClient.getDoc(collectionId, slug, {mode});
    if (!doc) {
      continue;
    }
    extractFields(
      docStrings,
      collectionSchema.fields,
      doc.fields || {},
      collectionSchema.types || {},
      normalizeString
    );
  }

  const taggedTranslations = await cmsClient.loadTranslations({tags: [docId]});
  const unusedTranslations: Array<{hash: string; source: string}> = [];
  Object.entries(taggedTranslations).forEach(([hash, translation]) => {
    const source = normalizeString(translation.source);
    if (!docStrings.has(source)) {
      unusedTranslations.push({hash, source});
    }
  });

  const taggedCount = Object.keys(taggedTranslations).length;
  console.log(
    `found ${taggedCount} translation(s) tagged with "${docId}".`
  );
  if (unusedTranslations.length === 0) {
    console.log('no unused translations found.');
    return;
  }

  console.log(`removing tag from ${unusedTranslations.length} translation(s)...`);
  const translationsPath = `Projects/${cmsClient.projectId}/Translations`;
  const batch = cmsClient.db.batch();
  unusedTranslations.forEach(({hash}) => {
    const ref = cmsClient.db.doc(`${translationsPath}/${hash}`);
    batch.update(ref, {tags: FieldValue.arrayRemove(docId)});
  });
  await batch.commit();

  console.log('removed tags from the following sources:');
  unusedTranslations.forEach(({source}) => {
    console.log(`- ${source}`);
  });
}

function extractFields(
  strings: Set<string>,
  fields: Field[],
  data: Record<string, any>,
  types: Record<string, Schema> = {},
  normalizeString: NormalizeStringFn
) {
  fields.forEach((field) => {
    if (!field.id) {
      return;
    }
    const fieldValue = data[field.id];
    extractField(strings, field, fieldValue, types, normalizeString);
  });
}

function extractField(
  strings: Set<string>,
  field: Field,
  fieldValue: any,
  types: Record<string, Schema> = {},
  normalizeString: NormalizeStringFn
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
    extractFields(strings, field.fields || [], fieldValue, types, normalizeString);
  } else if (field.type === 'array') {
    const arrayKeys = fieldValue._array || [];
    for (const arrayKey of arrayKeys) {
      extractField(
        strings,
        field.of,
        fieldValue[arrayKey],
        types,
        normalizeString
      );
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addString(fieldValue);
    }
  } else if (field.type === 'image') {
    if (field.translate && fieldValue && fieldValue.alt && field.alt !== false) {
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
    let fieldValueType: Schema | undefined;
    if (typeof fieldTypes[0] === 'string') {
      const typeId = fieldValue._type as string;
      if ((fieldTypes as string[]).includes(typeId)) {
        fieldValueType = types[typeId];
      }
    } else {
      fieldValueType = (fieldTypes as any[]).find(
        (item: any) => item.name === fieldValue._type
      );
    }
    if (fieldValueType) {
      extractFields(
        strings,
        fieldValueType.fields || [],
        fieldValue,
        types,
        normalizeString
      );
    }
  } else if (field.type === 'richtext') {
    if (field.translate) {
      extractRichTextStrings(strings, fieldValue, normalizeString);
    }
  }
}

function extractRichTextStrings(
  strings: Set<string>,
  data: RichTextData,
  normalizeString: NormalizeStringFn
) {
  const blocks = data?.blocks || [];
  blocks.forEach((block) => {
    extractBlockStrings(strings, block, normalizeString);
  });
}

function extractBlockStrings(
  strings: Set<string>,
  block: RichTextBlock,
  normalizeString: NormalizeStringFn
) {
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
    if (isPlainObject(value)) {
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
    const rows = block.data?.rows || [];
    rows.forEach((row: RichTextTableRow) => {
      const cells = row.cells || [];
      cells.forEach((cell) => {
        const cellBlocks = cell.blocks || [];
        cellBlocks.forEach((cellBlock) => {
          extractBlockStrings(strings, cellBlock, normalizeString);
        });
      });
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
