import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
  RichTextTableCell,
  RichTextTableRow,
} from './richtext.js';
import * as schema from './schema.js';

/** Strings taht won't be extracted. */
const DO_NOT_TRANSLATE = [
  '<br>',
  '&nbsp;',
  ' ', // Single space.
  '\n', // Single newline.
];

/**
 * Recursively extracts all translatable strings from a set of fields.
 *
 * @param strings - A Set to collect the extracted strings.
 * @param fields - The schema definition for the fields.
 * @param data - The data object containing the field values.
 * @param types - A map of schema types, used for resolving 'oneof' fields.
 */
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

/**
 * Extracts translatable strings from a single field.
 *
 * @param strings - A Set to collect the extracted strings.
 * @param field - The schema definition for the field.
 * @param fieldValue - The value of the field.
 * @param types - A map of schema types, used for resolving 'oneof' fields.
 */
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
    if (str && !isBlocked(str)) {
      strings.add(str);
    }
  }

  if (field.type === 'object') {
    extractFields(strings, field.fields || [], fieldValue, types);
  } else if (field.type === 'array') {
    if (Array.isArray(fieldValue)) {
      // Simple array of objects.
      for (const arrayValue of fieldValue) {
        extractField(strings, field.of, arrayValue, types);
      }
    } else if (fieldValue._array) {
      // Normalized array object.
      const arrayKeys = fieldValue._array || [];
      for (const arrayKey of arrayKeys) {
        extractField(strings, field.of, fieldValue[arrayKey], types);
      }
    }
  } else if (field.type === 'string' || field.type === 'select') {
    if (field.translate) {
      addString(fieldValue);
    }
  } else if (field.type === 'image' || field.type === 'file') {
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
  } else if (
    field.type === 'boolean' ||
    field.type === 'reference' ||
    field.type === 'references' ||
    field.type === 'number' ||
    field.type === 'datetime' ||
    field.type === 'date'
  ) {
    // Intentionally blank.
  } else {
    console.log(
      `extract: ignoring field, id=${(field as any).id}, type=${
        (field as any).type
      }`
    );
  }
}

/**
 * Extracts translatable strings from rich text data.
 *
 * @param strings - A Set to collect the extracted strings.
 * @param data - The rich text data object.
 */
export function extractRichTextStrings(
  strings: Set<string>,
  data: RichTextData
) {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];
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
    if (str && !isBlocked(str)) {
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
      cells.forEach((cell: RichTextTableCell) => {
        // Each cell contains an array of blocks
        const cellBlocks = Array.isArray(cell.blocks) ? cell.blocks : [];
        cellBlocks.forEach((cellBlock: RichTextBlock) => {
          extractBlockStrings(strings, cellBlock);
        });
      });
    });
  }
}

/**
 * Cleans a string that's used for translations. Performs the following:
 * - Removes any leading/trailing whitespace
 * - Removes spaces at the end of any line
 *
 * @param str - The string to normalize.
 * @returns The normalized string.
 */
export function normalizeString(str: string) {
  const lines = String(str)
    .trim()
    .split('\n')
    .map((line) => removeTrailingWhitespace(line));
  return lines.join('\n');
}

function removeTrailingWhitespace(str: string) {
  return String(str)
    .trimEnd()
    .replace(/&nbsp;$/, '');
}

function isObject(data: any): boolean {
  return typeof data === 'object' && !Array.isArray(data) && data !== null;
}

function isBlocked(text: string) {
  return DO_NOT_TRANSLATE.includes(text);
}
