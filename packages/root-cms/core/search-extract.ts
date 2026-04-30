/**
 * Pure (no I/O) extraction of searchable text from CMS doc data, guided by the
 * collection's schema.
 *
 * Walks `fields: {...}` recursively and emits one record per leaf "text-bearing"
 * field. The emitted `deepKey` matches the format used by the doc editor's
 * deep-link system (see ui/hooks/useDeeplink.tsx) so that clicking a search
 * result navigates the editor to the originating field.
 *
 * Reference for the deepKey format (see ui/components/DocEditor/DocEditor.tsx):
 * - Top-level field:     fields.<id>
 * - Nested object field: fields.<id>.<sub>
 * - Array item field:    fields.<id>.<autokey>.<sub>   (autokeys come from `_array`)
 * - oneOf field:         fields.<id>.<sub>             (siblings of `_type`)
 */

import type {
  ArrayField,
  Field,
  ObjectField,
  OneOfField,
  Schema,
} from './schema.js';

/** Hard cap for any single extracted text value. */
export const MAX_FIELD_TEXT_CHARS = 2000;

export interface ExtractedRecord {
  /** Stable record id: `<docId>#<deepKey>`. */
  id: string;
  /** Doc id, e.g. `Pages/foo-bar`. */
  docId: string;
  collection: string;
  slug: string;
  /** Full deep-link path, e.g. `fields.author.name` or `fields.list.<key>.title`. */
  deepKey: string;
  /** Field type, e.g. `string`, `richtext`, `select`. */
  fieldType: string;
  /** UI label for the field (falls back to `id`). */
  fieldLabel: string;
  /** Extracted plain text, truncated to MAX_FIELD_TEXT_CHARS. */
  text: string;
}

interface EmitContext {
  docId: string;
  collection: string;
  slug: string;
}

type EmitFn = (record: ExtractedRecord) => void;

/** Strip HTML tags and decode common entities from a string. */
export function stripHtml(input: string): string {
  if (!input) {
    return '';
  }
  // Drop <script>/<style> blocks entirely so their contents don't leak in.
  const dropped = input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const noTags = dropped.replace(/<[^>]+>/g, ' ');
  const decoded = noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
  return decoded.replace(/\s+/g, ' ').trim();
}

interface RichTextLike {
  blocks?: Array<{type?: string; data?: any}>;
}

interface ListItemLike {
  content?: string;
  items?: ListItemLike[];
}

function extractListItems(items: ListItemLike[] | undefined): string {
  if (!items?.length) {
    return '';
  }
  const parts: string[] = [];
  for (const item of items) {
    if (item?.content) {
      parts.push(stripHtml(item.content));
    }
    if (item?.items?.length) {
      parts.push(extractListItems(item.items));
    }
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Extracts plain text from a richtext value (EditorJS-shaped).
 *
 * Supported block types mirror those rendered in `core/richtext.tsx`:
 * paragraph, heading, quote, ordered/unordered list, table, html. Unknown or
 * non-textual blocks (e.g. delimiter, image) contribute nothing.
 */
export function extractRichText(data: RichTextLike | unknown): string {
  if (!data || typeof data !== 'object') {
    return '';
  }
  const blocks = (data as RichTextLike).blocks;
  if (!Array.isArray(blocks)) {
    return '';
  }
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const type = block.type;
    const d = block.data || {};
    switch (type) {
      case 'paragraph':
      case 'heading':
      case 'quote':
        if (typeof d.text === 'string' && d.text) {
          parts.push(stripHtml(d.text));
        }
        break;
      case 'orderedList':
      case 'unorderedList':
        parts.push(extractListItems(d.items));
        break;
      case 'table': {
        const rows = Array.isArray(d.rows) ? d.rows : [];
        for (const row of rows) {
          const cells = Array.isArray(row?.cells) ? row.cells : [];
          for (const cell of cells) {
            parts.push(extractRichText({blocks: cell?.blocks || []}));
          }
        }
        break;
      }
      case 'html':
        if (typeof d.html === 'string' && d.html) {
          parts.push(stripHtml(d.html));
        }
        break;
      default:
        // Unknown / non-textual block (delimiter, image, custom): skip.
        break;
    }
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_FIELD_TEXT_CHARS) {
    return text;
  }
  return text.slice(0, MAX_FIELD_TEXT_CHARS);
}

function fieldLabelOrId(field: Field): string {
  if (field.label) {
    return field.label;
  }
  if (field.id) {
    return field.id;
  }
  return field.type;
}

/**
 * Walks a doc's `fields` against its collection schema and emits one record per
 * text-bearing leaf field.
 */
export function walkSchemaFields(
  fields: Field[],
  data: any,
  parentDeepKey: string,
  ctx: EmitContext,
  emit: EmitFn
) {
  if (!Array.isArray(fields) || !data || typeof data !== 'object') {
    return;
  }
  for (const field of fields) {
    if (!field?.id) {
      continue;
    }
    const deepKey = `${parentDeepKey}.${field.id}`;
    const value = (data as Record<string, any>)[field.id];
    walkField(field, value, deepKey, ctx, emit);
  }
}

function walkField(
  field: Field,
  value: any,
  deepKey: string,
  ctx: EmitContext,
  emit: EmitFn
) {
  const fieldLabel = fieldLabelOrId(field);
  switch (field.type) {
    case 'string': {
      if (typeof value === 'string' && value.trim()) {
        emitText(deepKey, fieldLabel, field.type, value, ctx, emit);
      }
      break;
    }
    case 'select': {
      if (typeof value === 'string' && value.trim()) {
        emitText(deepKey, fieldLabel, field.type, value, ctx, emit);
      }
      break;
    }
    case 'multiselect': {
      if (Array.isArray(value)) {
        const text = value.filter((v) => typeof v === 'string').join(' ');
        if (text.trim()) {
          emitText(deepKey, fieldLabel, field.type, text, ctx, emit);
        }
      }
      break;
    }
    case 'richtext': {
      const text = extractRichText(value);
      if (text) {
        emitText(deepKey, fieldLabel, field.type, text, ctx, emit);
      }
      break;
    }
    case 'object': {
      const objectField = field as ObjectField;
      if (value && typeof value === 'object') {
        walkSchemaFields(objectField.fields, value, deepKey, ctx, emit);
      }
      break;
    }
    case 'array': {
      const arrayField = field as ArrayField;
      walkArray(arrayField, value, deepKey, ctx, emit);
      break;
    }
    case 'oneof': {
      const oneOfField = field as OneOfField;
      walkOneOf(oneOfField, value, deepKey, ctx, emit);
      break;
    }
    // Non-text or non-searchable: number, date, datetime, boolean, image,
    // file, reference, references — intentionally skipped.
    default:
      break;
  }
}

interface ArrayValue {
  _array?: string[];
  [key: string]: any;
}

function walkArray(
  field: ArrayField,
  value: ArrayValue | undefined,
  deepKey: string,
  ctx: EmitContext,
  emit: EmitFn
) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const order = Array.isArray(value._array) ? value._array : [];
  if (order.length === 0) {
    return;
  }
  const itemField = field.of;
  for (const autokey of order) {
    if (typeof autokey !== 'string' || !autokey) {
      continue;
    }
    const itemValue = value[autokey];
    if (itemValue === undefined || itemValue === null) {
      continue;
    }
    const itemDeepKey = `${deepKey}.${autokey}`;
    if (itemField?.type === 'object') {
      walkSchemaFields(
        (itemField as ObjectField).fields,
        itemValue,
        itemDeepKey,
        ctx,
        emit
      );
    } else if (itemField?.type === 'oneof') {
      walkOneOf(itemField as OneOfField, itemValue, itemDeepKey, ctx, emit);
    } else {
      // ImageField / FileField / ReferenceField items don't yield searchable
      // text under the current rules.
    }
  }
}

function walkOneOf(
  field: OneOfField,
  value: any,
  deepKey: string,
  ctx: EmitContext,
  emit: EmitFn
) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const typeName = typeof value._type === 'string' ? value._type : '';
  if (!typeName) {
    return;
  }
  const types = field.types;
  let matchedSchema: Schema | null = null;
  if (Array.isArray(types)) {
    for (const candidate of types) {
      if (candidate && typeof candidate === 'object') {
        const schema = candidate as Schema;
        if (schema.name === typeName) {
          matchedSchema = schema;
          break;
        }
      }
    }
  }
  if (!matchedSchema) {
    return;
  }
  walkSchemaFields(matchedSchema.fields, value, deepKey, ctx, emit);
}

function emitText(
  deepKey: string,
  fieldLabel: string,
  fieldType: string,
  rawText: string,
  ctx: EmitContext,
  emit: EmitFn
) {
  const text = truncate(rawText.replace(/\s+/g, ' ').trim());
  if (!text) {
    return;
  }
  emit({
    id: `${ctx.docId}#${deepKey}`,
    docId: ctx.docId,
    collection: ctx.collection,
    slug: ctx.slug,
    deepKey,
    fieldType,
    fieldLabel,
    text,
  });
}

export interface ExtractDocOptions {
  collection: string;
  slug: string;
  /** Top-level fields object as stored on the doc. */
  fields: any;
}

/** Extracts every searchable record from a single doc. */
export function extractDocRecords(
  schema: Schema,
  options: ExtractDocOptions
): ExtractedRecord[] {
  const records: ExtractedRecord[] = [];
  const docId = `${options.collection}/${options.slug}`;
  const ctx: EmitContext = {
    docId,
    collection: options.collection,
    slug: options.slug,
  };
  walkSchemaFields(schema.fields, options.fields || {}, 'fields', ctx, (rec) =>
    records.push(rec)
  );
  return records;
}
