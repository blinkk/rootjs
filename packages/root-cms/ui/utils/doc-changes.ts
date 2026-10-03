import * as schema from '../../core/schema.js';
import {
  RichTextBlock,
  RichTextData,
  RichTextListItem,
  testSameRichTextContent,
} from '../../shared/richtext.js';
import {isObject, stableJsonStringify} from './objects.js';
import {buildPreviewValue} from './schema-previews.js';

export type DocChangeType = 'added' | 'removed' | 'modified' | 'reordered';

/** Max length of the text used to describe an array item without a preview. */
const SNIPPET_LENGTH = 40;

/** A single human-readable change between two versions of a doc's fields. */
export interface DocChange {
  /** How the value changed. */
  type: DocChangeType;
  /** Deep key of the changed value, e.g. `fields.sections.k1a2.title`. */
  deepKey: string;
  /**
   * Labels from the root field down to the changed value, e.g.
   * `['Sections', '#2 · Hero', 'Title']`. Empty for a value nested directly
   * in its parent change (e.g. the image of an added array of images item).
   */
  path: string[];
  /**
   * The schema field for the value. Values that aren't in the schema (e.g.
   * from a deleted field) get a field inferred from the data, if possible.
   */
  field?: schema.Field;
  /**
   * Value before the change. For a one-of value whose type changed, the type
   * label. For a `reordered` array, the item names in the old order. Unset
   * for an added or removed array item, whose contents are in `children`.
   */
  before?: any;
  /**
   * Value after the change. For a one-of value whose type changed, the type
   * label. For a `reordered` array, the item names in the new order.
   */
  after?: any;
  /**
   * The contents of an array item that was added or removed, or of a one-of
   * value whose type changed. Paths are relative to the parent change.
   */
  children?: DocChange[];
}

interface DiffContext {
  /** Schema types used for resolving one-of fields. */
  types: Record<string, schema.Schema>;
}

/**
 * Compares the `fields` of two versions of a doc and returns the changes as
 * a flat list, in schema order. Values are labeled using the collection's
 * schema, so a change reads as e.g. `Hero › Title` rather than a JSON path.
 *
 * Array items are matched by their stable array keys, so moving an item is
 * reported as a reorder rather than as every item changing. Values that
 * aren't in the schema are still compared, labeled by their raw key. Field
 * metadata (`@<id>` keys) is ignored.
 *
 * ```ts
 * const changes = diffDocFields(collection, published.fields, draft.fields);
 * // => [{type: 'modified', path: ['Hero', 'Title'], before: 'Hi', after: 'Hello', ...}]
 * ```
 */
export function diffDocFields(
  collection: schema.Collection | null | undefined,
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined
): DocChange[] {
  const ctx: DiffContext = {types: collection?.types || {}};
  const changes: DocChange[] = [];
  diffFields(
    ctx,
    collection?.fields || [],
    asObject(before),
    asObject(after),
    'fields',
    [],
    changes
  );
  return changes;
}

function diffFields(
  ctx: DiffContext,
  fields: schema.FieldWithId[],
  before: Record<string, any>,
  after: Record<string, any>,
  deepKey: string,
  path: string[],
  changes: DocChange[]
) {
  const knownKeys = new Set<string>();
  for (const field of fields) {
    if (!field.id) {
      continue;
    }
    knownKeys.add(field.id);
    diffValue(
      ctx,
      field,
      before[field.id],
      after[field.id],
      `${deepKey}.${field.id}`,
      [...path, getFieldLabel(field)],
      changes
    );
  }

  // Compare any values that aren't defined in the schema.
  const extraKeys = new Set<string>();
  for (const key of [...Object.keys(before), ...Object.keys(after)]) {
    if (!knownKeys.has(key) && !testIgnoredKey(key)) {
      extraKeys.add(key);
    }
  }
  for (const key of Array.from(extraKeys).sort()) {
    const field = inferField(key, before[key], after[key]);
    diffValue(
      ctx,
      field,
      before[key],
      after[key],
      `${deepKey}.${key}`,
      [...path, key],
      changes
    );
  }
}

function diffValue(
  ctx: DiffContext,
  field: schema.Field,
  before: any,
  after: any,
  deepKey: string,
  path: string[],
  changes: DocChange[]
) {
  if (field.type === 'object') {
    diffFields(
      ctx,
      field.fields || [],
      asObject(before),
      asObject(after),
      deepKey,
      path,
      changes
    );
  } else if (field.type === 'oneof') {
    diffOneOf(ctx, field, before, after, deepKey, path, changes);
  } else if (field.type === 'array') {
    diffArray(ctx, field, before, after, deepKey, path, changes);
  } else {
    diffLeaf(field, before, after, deepKey, path, changes);
  }
}

function diffOneOf(
  ctx: DiffContext,
  field: schema.OneOfField,
  before: any,
  after: any,
  deepKey: string,
  path: string[],
  changes: DocChange[]
) {
  const beforeType: string | undefined = before?._type || undefined;
  const afterType: string | undefined = after?._type || undefined;
  if (beforeType === afterType) {
    const typeSchema = resolveOneOfType(ctx, field, afterType);
    diffFields(
      ctx,
      typeSchema?.fields || [],
      asObject(before),
      asObject(after),
      deepKey,
      path,
      changes
    );
    return;
  }

  // The type changed, so the old and new values are unrelated. Report a
  // single change that holds the removed and added content.
  const children: DocChange[] = [];
  if (beforeType) {
    diffFields(
      ctx,
      resolveOneOfType(ctx, field, beforeType)?.fields || [],
      asObject(before),
      {},
      deepKey,
      [],
      children
    );
  }
  if (afterType) {
    diffFields(
      ctx,
      resolveOneOfType(ctx, field, afterType)?.fields || [],
      {},
      asObject(after),
      deepKey,
      [],
      children
    );
  }
  changes.push({
    type: !beforeType ? 'added' : !afterType ? 'removed' : 'modified',
    deepKey,
    path,
    field,
    before: beforeType && getTypeLabel(ctx, field, beforeType),
    after: afterType && getTypeLabel(ctx, field, afterType),
    children,
  });
}

interface ArrayItem {
  key: string;
  value: any;
}

function diffArray(
  ctx: DiffContext,
  field: schema.ArrayField,
  before: any,
  after: any,
  deepKey: string,
  path: string[],
  changes: DocChange[]
) {
  const beforeItems = toArrayItems(before);
  const afterItems = toArrayItems(after);
  const beforeByKey = new Map(beforeItems.map((item) => [item.key, item]));
  const afterByKey = new Map(afterItems.map((item) => [item.key, item]));
  const beforePreviews = beforeItems.map((item, i) =>
    getArrayItemPreview(ctx, field, item.value, i)
  );
  const afterPreviews = afterItems.map((item, i) =>
    getArrayItemPreview(ctx, field, item.value, i)
  );
  const beforeLabels = beforePreviews.map((preview, i) =>
    formatArrayItemLabel(i, preview)
  );
  const afterLabels = afterPreviews.map((preview, i) =>
    formatArrayItemLabel(i, preview)
  );

  // Items that exist in both versions but in a different order.
  const beforeOrder = beforeItems
    .filter((item) => afterByKey.has(item.key))
    .map((item) => item.key);
  const afterOrder = afterItems
    .filter((item) => beforeByKey.has(item.key))
    .map((item) => item.key);
  if (beforeOrder.join('\n') !== afterOrder.join('\n')) {
    // Items are named the same in both orders so they can be followed from
    // one to the other.
    const beforeNames = beforePreviews.map(
      (preview, i) => preview || `Item ${i + 1}`
    );
    const beforeIndexes = new Map(beforeItems.map((item, i) => [item.key, i]));
    const afterNames = afterItems.map((item, i) => {
      const beforeIndex = beforeIndexes.get(item.key);
      if (beforeIndex === undefined) {
        return afterPreviews[i] || 'New item';
      }
      return beforeNames[beforeIndex];
    });
    changes.push({
      type: 'reordered',
      deepKey,
      path,
      field,
      before: beforeNames,
      after: afterNames,
    });
  }

  afterItems.forEach((item, i) => {
    const itemDeepKey = `${deepKey}.${item.key}`;
    const itemPath = [...path, afterLabels[i]];
    const beforeItem = beforeByKey.get(item.key);
    if (beforeItem) {
      diffValue(
        ctx,
        field.of,
        beforeItem.value,
        item.value,
        itemDeepKey,
        itemPath,
        changes
      );
      return;
    }
    const children: DocChange[] = [];
    diffArrayItem(ctx, field.of, undefined, item.value, itemDeepKey, children);
    changes.push({
      type: 'added',
      deepKey: itemDeepKey,
      path: itemPath,
      field: field.of,
      children,
    });
  });

  beforeItems.forEach((item, i) => {
    if (afterByKey.has(item.key)) {
      return;
    }
    const itemDeepKey = `${deepKey}.${item.key}`;
    const children: DocChange[] = [];
    diffArrayItem(ctx, field.of, item.value, undefined, itemDeepKey, children);
    changes.push({
      type: 'removed',
      deepKey: itemDeepKey,
      path: [...path, beforeLabels[i]],
      field: field.of,
      children,
    });
  });
}

/** Diffs the contents of an added or removed array item. */
function diffArrayItem(
  ctx: DiffContext,
  field: schema.Field,
  before: any,
  after: any,
  deepKey: string,
  changes: DocChange[]
) {
  if (field.type === 'object') {
    diffFields(
      ctx,
      field.fields || [],
      asObject(before),
      asObject(after),
      deepKey,
      [],
      changes
    );
  } else if (field.type === 'oneof') {
    const typeName = (before || after)?._type;
    diffFields(
      ctx,
      resolveOneOfType(ctx, field, typeName)?.fields || [],
      asObject(before),
      asObject(after),
      deepKey,
      [],
      changes
    );
  } else {
    diffValue(ctx, field, before, after, deepKey, [], changes);
  }
}

function diffLeaf(
  field: schema.Field,
  before: any,
  after: any,
  deepKey: string,
  path: string[],
  changes: DocChange[]
) {
  const beforeEmpty = testEmptyValue(field.type, before);
  const afterEmpty = testEmptyValue(field.type, after);
  if (beforeEmpty && afterEmpty) {
    return;
  }
  if (!beforeEmpty && !afterEmpty && testSameValue(field, before, after)) {
    return;
  }
  let type: DocChangeType = 'modified';
  // A boolean is always set, so turning it on or off is a change.
  if (field.type !== 'boolean') {
    type = beforeEmpty ? 'added' : afterEmpty ? 'removed' : 'modified';
  }
  changes.push({
    type,
    deepKey,
    path,
    field,
    before: beforeEmpty ? undefined : before,
    after: afterEmpty ? undefined : after,
  });
}

/**
 * Returns true if a value should be treated as unset. Unset values compare as
 * equal, so e.g. an empty string that replaced `undefined` isn't a change.
 */
function testEmptyValue(fieldType: string, value: any): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (fieldType === 'boolean') {
    return value === false;
  }
  if (fieldType === 'richtext') {
    return !Array.isArray(value?.blocks) || value.blocks.length === 0;
  }
  if (fieldType === 'image' || fieldType === 'file') {
    return !value?.src;
  }
  if (fieldType === 'reference') {
    return !value?.id;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (testTimestamp(value)) {
    return false;
  }
  if (isObject(value)) {
    return Object.values(value).every((v) => testEmptyValue('', v));
  }
  return false;
}

function testSameValue(field: schema.Field, before: any, after: any): boolean {
  if (field.type === 'richtext') {
    return testSameRichTextContent(before, after);
  }
  if (field.type === 'references') {
    return (
      stableJsonStringify(toReferenceIds(before)) ===
      stableJsonStringify(toReferenceIds(after))
    );
  }
  return (
    stableJsonStringify(normalizeValue(before)) ===
    stableJsonStringify(normalizeValue(after))
  );
}

/** Converts timestamps to millis so they can be compared as JSON. */
function normalizeValue(value: any): any {
  if (testTimestamp(value)) {
    return toMillis(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalizeValue(v));
  }
  if (isObject(value)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = normalizeValue(value[key]);
    }
    return result;
  }
  return value;
}

/**
 * Infers a field for a value that isn't defined in the schema, so that it's
 * compared and rendered sensibly.
 */
function inferField(id: string, before: any, after: any): schema.Field {
  const sample = before ?? after;
  if (testArrayObject(before) || testArrayObject(after)) {
    return {
      type: 'array',
      id,
      of: {type: 'object', fields: []},
    };
  }
  if (testRichTextValue(sample)) {
    return {type: 'richtext', id};
  }
  if (testTimestamp(sample)) {
    return {type: 'datetime', id};
  }
  if (isObject(sample) && typeof sample.src === 'string') {
    return {type: 'file', id};
  }
  if (isObject(sample)) {
    return {type: 'object', id, fields: []};
  }
  if (typeof sample === 'boolean') {
    return {type: 'boolean', id};
  }
  // Values without a usable type are compared as-is and rendered as text or
  // JSON.
  return {type: 'unknown', id} as unknown as schema.Field;
}

function testIgnoredKey(key: string): boolean {
  // `@<id>` keys hold field metadata (e.g. translation settings), `_type` is
  // the one-of type and `_array` is the array item order.
  return key.startsWith('@') || key === '_type' || key === '_array';
}

function toArrayItems(value: any): ArrayItem[] {
  if (Array.isArray(value)) {
    return value.map((v, i) => ({key: String(i), value: v}));
  }
  if (testArrayObject(value)) {
    return (value._array as string[]).map((key) => ({
      key,
      value: value[key],
    }));
  }
  return [];
}

function testArrayObject(value: any): boolean {
  return isObject(value) && Array.isArray(value._array);
}

function testRichTextValue(value: any): boolean {
  return isObject(value) && Array.isArray(value.blocks);
}

/** Returns true for Firestore timestamps, live or serialized. */
export function testTimestamp(value: any): boolean {
  if (!isObject(value)) {
    return false;
  }
  if (typeof value.toMillis === 'function') {
    return true;
  }
  const keys = Object.keys(value).sort().join(',');
  return keys === 'nanoseconds,seconds' || keys === '_nanoseconds,_seconds';
}

/** Converts a Firestore timestamp to millis. */
export function toMillis(value: any): number {
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }
  const seconds = value?.seconds ?? value?._seconds ?? 0;
  const nanos = value?.nanoseconds ?? value?._nanoseconds ?? 0;
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

/** Returns the doc ids from a `references` field value. */
export function toReferenceIds(value: any): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((ref) => (typeof ref === 'string' ? ref : ref?.id))
    .filter((id): id is string => Boolean(id));
}

function asObject(value: any): Record<string, any> {
  return isObject(value) ? value : {};
}

function getFieldLabel(field: schema.Field): string {
  return field.label || field.id || '';
}

function resolveOneOfType(
  ctx: DiffContext,
  field: schema.OneOfField,
  typeName: string | undefined
): schema.Schema | undefined {
  if (!typeName) {
    return undefined;
  }
  if (Array.isArray(field.types)) {
    const inline = (field.types as Array<schema.Schema | string>).find(
      (t): t is schema.Schema => typeof t !== 'string' && t.name === typeName
    );
    if (inline) {
      return inline;
    }
  }
  return ctx.types[typeName];
}

function getTypeLabel(
  ctx: DiffContext,
  field: schema.OneOfField,
  typeName: string
): string {
  return resolveOneOfType(ctx, field, typeName)?.label || typeName;
}

/** Returns the label for an array item, e.g. `#2 · Hero`. */
function formatArrayItemLabel(index: number, preview?: string): string {
  const label = `#${index + 1}`;
  return preview ? `${label} · ${preview}` : label;
}

/**
 * Returns the preview title for an array item, falling back to its one-of
 * type label.
 */
function getArrayItemPreview(
  ctx: DiffContext,
  field: schema.ArrayField,
  value: any,
  index: number
): string | undefined {
  try {
    return buildArrayItemPreview(ctx, field, value, index);
  } catch (err) {
    console.warn(`failed to build preview for ${field.id}`, err);
    return undefined;
  }
}

function buildArrayItemPreview(
  ctx: DiffContext,
  field: schema.ArrayField,
  value: any,
  index: number
): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const typeSchema =
    field.of.type === 'oneof'
      ? resolveOneOfType(ctx, field.of, value._type)
      : undefined;
  const preview =
    buildPreviewValue(typeSchema?.preview?.title, value, {index}) ||
    buildPreviewValue(field.preview, value, {index});
  if (preview) {
    return preview;
  }
  // Without a configured preview, describe the item by its type and its first
  // text value so that similar items can be told apart.
  const typeLabel = value._type ? typeSchema?.label || value._type : undefined;
  const fields =
    typeSchema?.fields ||
    (field.of.type === 'object' ? field.of.fields : undefined) ||
    [];
  const snippet = getTextSnippet(fields, value);
  if (typeLabel && snippet) {
    return `${typeLabel}: ${snippet}`;
  }
  return typeLabel || snippet;
}

/** Returns the (truncated) value of the first non-empty string field. */
function getTextSnippet(
  fields: schema.FieldWithId[],
  value: Record<string, any>
): string | undefined {
  for (const field of fields) {
    const text = field.id && value[field.id];
    if (field.type === 'string' && typeof text === 'string' && text.trim()) {
      const line = text.trim().split('\n')[0];
      return line.length > SNIPPET_LENGTH
        ? `${line.slice(0, SNIPPET_LENGTH).trimEnd()}…`
        : line;
    }
  }
  return undefined;
}

/**
 * Converts rich text to plain text for display in a diff. Each block is
 * separated by a blank line, lists are bulleted and custom blocks are shown
 * by type.
 */
export function richTextToPlainText(data: RichTextData | null | undefined) {
  const blocks = data?.blocks || [];
  return blocks
    .map((block) => blockToPlainText(block))
    .filter((text) => text !== '')
    .join('\n\n');
}

function blockToPlainText(block: RichTextBlock): string {
  if (!block?.type) {
    return '';
  }
  const data: any = block.data || {};
  if (block.type === 'paragraph' || block.type === 'heading') {
    return htmlToPlainText(data.text || '');
  }
  if (block.type === 'orderedList' || block.type === 'unorderedList') {
    return listToPlainText(data.items || [], block.type === 'orderedList', 0);
  }
  if (block.type === 'table') {
    const rows: any[] = data.rows || [];
    return rows
      .map((row) =>
        (row.cells || [])
          .map((cell: any) =>
            (cell.blocks || [])
              .map((b: RichTextBlock) => blockToPlainText(b))
              .join(' ')
          )
          .join(' | ')
      )
      .join('\n');
  }
  if (block.type === 'image') {
    const file = data.file || {};
    return `[Image: ${file.alt || file.url || file.src || ''}]`;
  }
  if (block.type === 'html') {
    return `[HTML: ${htmlToPlainText(data.html || '')}]`;
  }
  return `[${block.type}]`;
}

function listToPlainText(
  items: RichTextListItem[],
  ordered: boolean,
  depth: number
): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  items.forEach((item, i) => {
    const bullet = ordered ? `${i + 1}.` : '•';
    lines.push(`${indent}${bullet} ${htmlToPlainText(item.content || '')}`);
    if (item.items && item.items.length > 0) {
      const childOrdered = item.itemsType
        ? item.itemsType === 'orderedList'
        : ordered;
      lines.push(listToPlainText(item.items, childOrdered, depth + 1));
    }
  });
  return lines.join('\n');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
