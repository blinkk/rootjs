/**
 * Extracts translatable strings from doc field values, using the collection
 * schema to find fields marked with `translate: true`. Isomorphic, so it can be
 * used by both the CMS UI and server code (e.g. the v1 -> v2 translations
 * migration).
 */

import type * as schema from '../core/schema.js';
import {isObject} from './objects.js';
import type {
  RichTextBlock,
  RichTextData,
  RichTextInlineComponentsMap,
  RichTextListItem,
  RichTextTableRow,
} from './richtext.js';
import {normalizeStr} from './strings.js';

/**
 * Normalizes a translatable string. Values are coerced to strings since field
 * data isn't guaranteed to match the schema.
 */
function normalizeString(value: unknown): string {
  return normalizeStr(String(value));
}

/**
 * Returns the set of translatable strings in a doc's `fields`.
 */
export function extractStringsFromFields(
  collection: schema.SchemaWithTypes,
  fields: Record<string, any>
): Set<string> {
  const strings = new Set<string>();
  extractFields(
    strings,
    collection.fields || [],
    fields || {},
    (collection.types || {}) as Record<string, schema.Schema>
  );
  return strings;
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

    const metadataKey = `@${field.id}`;
    const metadata = data[metadataKey];
    if (metadata?.translate === false || metadata?.disableTranslations) {
      return;
    }

    extractField(strings, field, fieldValue, types, metadata);
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

    const metadataKey = `@${field.id}`;
    const metadata = data[metadataKey];
    if (metadata?.translate === false || metadata?.disableTranslations) {
      return;
    }

    const description = metadata?.description;
    extractFieldWithMetadata(
      stringsWithMeta,
      field,
      fieldValue,
      types,
      description,
      metadata
    );
  });
}

export function extractField(
  strings: Set<string>,
  field: schema.Field,
  fieldValue: any,
  types: Record<string, schema.Schema> = {},
  metadata?: Record<string, any>
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
      field.alt !== false &&
      metadata?.alt !== false
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
    if (typeof (fieldTypes as any[])[0] === 'string') {
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
      extractRichTextStrings(strings, fieldValue, field, types);
    }
  }
}

export function extractFieldWithMetadata(
  stringsWithMeta: Map<string, {description?: string}>,
  field: schema.Field,
  fieldValue: any,
  types: Record<string, schema.Schema> = {},
  description?: string,
  metadata?: Record<string, any>
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
      field.alt !== false &&
      metadata?.alt !== false
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
    if (typeof (fieldTypes as any[])[0] === 'string') {
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
      extractRichTextStrings(strings, fieldValue, field, types);
      strings.forEach((str) => addStringWithMeta(str));
    }
  }
}

/**
 * Extracts translatable strings from rich text data. When the rich text
 * `field` is provided, strings from custom block and inline components are
 * extracted using the component schemas defined by the field's
 * `blockComponents` and `inlineComponents`.
 */
export function extractRichTextStrings(
  strings: Set<string>,
  data: RichTextData,
  field?: schema.RichTextField,
  types: Record<string, schema.Schema> = {}
) {
  const ctx: RichTextExtractContext = {
    blockComponents: toSchemaMap(field?.blockComponents),
    inlineComponents: toSchemaMap(field?.inlineComponents),
    types,
  };
  const blocks = data?.blocks || [];
  blocks.forEach((block) => {
    extractBlockStrings(strings, block, ctx);
  });
}

interface RichTextExtractContext {
  /** Custom block component schemas, keyed by schema name. */
  blockComponents: Map<string, schema.Schema>;
  /** Custom inline component schemas, keyed by schema name. */
  inlineComponents: Map<string, schema.Schema>;
  /** Schema types used for resolving `oneof` fields. */
  types: Record<string, schema.Schema>;
}

function toSchemaMap(schemas?: schema.Schema[]) {
  const map = new Map<string, schema.Schema>();
  (schemas || []).forEach((s) => {
    if (s?.name) {
      map.set(s.name, s);
    }
  });
  return map;
}

function extractBlockStrings(
  strings: Set<string>,
  block: RichTextBlock,
  ctx: RichTextExtractContext
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

  function addComponentStrings(components?: RichTextInlineComponentsMap) {
    if (!components) {
      return;
    }
    Object.values(components).forEach((component) => {
      const componentSchema =
        component?.type && ctx.inlineComponents.get(component.type);
      if (componentSchema) {
        extractFields(
          strings,
          componentSchema.fields || [],
          component.data || {},
          ctx.types
        );
      } else {
        collectComponentStrings(component);
      }
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

  const blockSchema = ctx.blockComponents.get(block.type);

  if (block.type === 'heading' || block.type === 'paragraph') {
    addString(block.data?.text);
    addComponentStrings(block.data?.components);
  } else if (block.type === 'orderedList' || block.type === 'unorderedList') {
    extractList(block.data?.items);
  } else if (block.type === 'table') {
    // Extract strings from table cells
    const rows = block.data?.rows || [];
    rows.forEach((row: RichTextTableRow) => {
      const cells = row.cells || [];
      cells.forEach((cell) => {
        // Each cell contains an array of blocks
        const cellBlocks = cell.blocks || [];
        cellBlocks.forEach((cellBlock) => {
          extractBlockStrings(strings, cellBlock, ctx);
        });
      });
    });
  } else if (blockSchema) {
    // Custom block components store their field values in `block.data`.
    extractFields(
      strings,
      blockSchema.fields || [],
      block.data || {},
      ctx.types
    );
  } else if (block.type === 'html') {
    addString(block.data?.html);
  } else if (block.type === 'image') {
    addString(block.data?.file?.alt);
    addString(block.data?.caption);
  }
}
