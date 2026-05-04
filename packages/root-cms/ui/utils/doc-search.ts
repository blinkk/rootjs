import * as schema from '../../core/schema.js';
import {
  RichTextBlock,
  RichTextData,
  RichTextInlineComponentsMap,
  RichTextListItem,
  RichTextTableRow,
} from '../../shared/richtext.js';

/**
 * Block types that are represented as native lexical nodes (paragraph, heading,
 * list, etc.) rather than as `BlockComponentNode`s. These blocks don't have an
 * editable modal — their text is searched inline.
 *
 * NOTE: `image` and `html` are *not* in this list because they are wrapped in
 * `BlockComponentNode`s by the lexical editor (via the built-in block schemas).
 * Treating them as custom blocks keeps the custom-block index in this search
 * aligned with the lexical tree's BlockComponentNode order.
 */
const NATIVE_LEXICAL_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'orderedList',
  'unorderedList',
  'table',
  'delimiter',
]);

/** Maximum number of characters to show before/after the matched text. */
const SNIPPET_CONTEXT_CHARS = 40;

/** Maximum number of search results to return. */
const MAX_RESULTS = 200;

/**
 * Custom event payload for opening a rich text block component's edit modal
 * from outside the rich text editor (e.g. when a search result deep-links to
 * a value living inside a custom block).
 */
export interface OpenRichTextBlockEventDetail {
  richTextDeepKey: string;
  blockIndex: number;
  blockName: string;
}

/** Event name for opening a rich text block component modal. */
export const OPEN_RICHTEXT_BLOCK_EVENT = 'root:openRichTextBlock';

/**
 * Custom event payload for opening a rich text inline component's edit modal
 * from outside the rich text editor.
 */
export interface OpenRichTextInlineEventDetail {
  richTextDeepKey: string;
  /** Stable component id assigned when the inline component was inserted. */
  componentId: string;
  componentName: string;
}

/** Event name for opening a rich text inline component modal. */
export const OPEN_RICHTEXT_INLINE_EVENT = 'root:openRichTextInline';

/** A single hit returned by the document search. */
export interface DocSearchResult {
  /**
   * The deep key of the field to navigate to. For matches inside a rich text
   * custom block or inline component, this is the rich text field's deep key
   * (so the editor jumps to the rich text container).
   */
  deepKey: string;
  /** A breadcrumb-style label, e.g. "Sections > [0] Hero > Title". */
  label: string;
  /** Snippet of the matching text, with surrounding context. */
  snippet: string;
  /** Highlight ranges within the snippet (start/end character offsets). */
  matches: Array<{start: number; end: number}>;
  /** The field's schema type, used to render an icon. */
  fieldType: string;
  /**
   * For matches inside a rich text custom block, additional info needed to
   * open the block's edit modal.
   */
  richTextBlock?: {
    /** The rich text field's deep key. */
    richTextDeepKey: string;
    /**
     * The 0-based index of the custom block among other custom blocks in the
     * rich text. Built-in blocks (paragraph, heading, list, etc.) are skipped,
     * so this matches the order of `BlockComponentNode`s in the lexical tree.
     */
    blockIndex: number;
    /** The block component schema name (e.g. "image", "video"). */
    blockName: string;
  };
  /**
   * For matches inside a rich text inline component, additional info needed
   * to open the component's edit modal.
   */
  richTextInline?: {
    richTextDeepKey: string;
    componentId: string;
    componentName: string;
  };
}

interface WalkContext {
  query: string;
  queryLower: string;
  results: DocSearchResult[];
  types: Record<string, schema.Schema>;
}

/**
 * Performs a brute-force breadth-first search through a document's data,
 * returning a list of fields whose values match the given query.
 *
 * The walk is driven by the schema (rather than the raw data alone) so that we
 * can build accurate deep-link keys and human-readable breadcrumb labels for
 * each result.
 */
export function searchDocFields(
  query: string,
  rootData: Record<string, any>,
  fields: schema.Field[],
  types: Record<string, schema.Schema> = {}
): DocSearchResult[] {
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return [];
  }
  const ctx: WalkContext = {
    query: trimmedQuery,
    queryLower: trimmedQuery.toLowerCase(),
    results: [],
    types: types,
  };
  const queue: Array<() => void> = [];
  enqueueFields(queue, ctx, fields, rootData, 'fields', []);
  while (queue.length > 0 && ctx.results.length < MAX_RESULTS) {
    const next = queue.shift()!;
    next();
  }
  return ctx.results;
}

function enqueueFields(
  queue: Array<() => void>,
  ctx: WalkContext,
  fields: schema.Field[],
  data: Record<string, any> | undefined,
  parentDeepKey: string,
  parentLabels: string[]
) {
  if (!data) {
    return;
  }
  for (const field of fields) {
    if (!field.id || field.hidden) {
      continue;
    }
    const value = data[field.id];
    const deepKey = `${parentDeepKey}.${field.id}`;
    const label = field.label || field.id;
    queue.push(() =>
      walkField(queue, ctx, field, value, deepKey, [...parentLabels, label])
    );
  }
}

function walkField(
  queue: Array<() => void>,
  ctx: WalkContext,
  field: schema.Field,
  value: any,
  deepKey: string,
  labels: string[]
) {
  if (value === null || value === undefined) {
    return;
  }
  switch (field.type) {
    case 'object': {
      enqueueFields(
        queue,
        ctx,
        (field as schema.ObjectField).fields || [],
        value,
        deepKey,
        labels
      );
      return;
    }
    case 'array': {
      const arrayField = field as schema.ArrayField;
      const order: string[] = value?._array || [];
      order.forEach((arrayKey, index) => {
        const itemValue = value?.[arrayKey];
        if (itemValue === undefined || itemValue === null) {
          return;
        }
        const itemLabel = `[${index}]`;
        // Wrap the item in a synthetic object/oneof traversal.
        const childField = arrayField.of as schema.Field;
        queue.push(() =>
          walkField(
            queue,
            ctx,
            childField,
            itemValue,
            `${deepKey}.${arrayKey}`,
            [...labels, itemLabel]
          )
        );
      });
      return;
    }
    case 'oneof': {
      const oneOfField = field as schema.OneOfField;
      const selectedTypeName = value?._type;
      if (!selectedTypeName) {
        return;
      }
      const fieldTypes = oneOfField.types || [];
      let selectedSchema: schema.Schema | undefined;
      if (typeof (fieldTypes as any[])[0] === 'string') {
        if ((fieldTypes as string[]).includes(selectedTypeName)) {
          selectedSchema = ctx.types[selectedTypeName];
        }
      } else {
        selectedSchema = (fieldTypes as schema.Schema[]).find(
          (s) => s?.name === selectedTypeName
        );
      }
      if (!selectedSchema) {
        return;
      }
      enqueueFields(queue, ctx, selectedSchema.fields || [], value, deepKey, [
        ...labels.slice(0, -1),
        `${labels.at(-1)} (${selectedTypeName})`,
      ]);
      return;
    }
    case 'string': {
      if (typeof value === 'string') {
        addStringMatch(ctx, value, field.type, deepKey, labels);
      }
      return;
    }
    case 'select': {
      if (typeof value === 'string') {
        addStringMatch(ctx, value, field.type, deepKey, labels);
      }
      return;
    }
    case 'multiselect': {
      if (Array.isArray(value)) {
        const joined = value.filter((v) => typeof v === 'string').join(', ');
        if (joined) {
          addStringMatch(ctx, joined, field.type, deepKey, labels);
        }
      }
      return;
    }
    case 'number': {
      if (typeof value === 'number') {
        addStringMatch(ctx, String(value), field.type, deepKey, labels);
      }
      return;
    }
    case 'boolean': {
      // Skip — booleans aren't useful to text search.
      return;
    }
    case 'date':
    case 'datetime': {
      if (typeof value === 'string') {
        addStringMatch(ctx, value, field.type, deepKey, labels);
      }
      return;
    }
    case 'image':
    case 'file': {
      if (value && typeof value === 'object') {
        const parts: string[] = [];
        if (typeof value.alt === 'string') parts.push(value.alt);
        if (typeof value.filename === 'string') parts.push(value.filename);
        if (typeof value.src === 'string') parts.push(value.src);
        if (parts.length > 0) {
          addStringMatch(ctx, parts.join(' '), field.type, deepKey, labels);
        }
      }
      return;
    }
    case 'reference': {
      if (value && typeof value === 'object' && typeof value.id === 'string') {
        addStringMatch(ctx, value.id, field.type, deepKey, labels);
      }
      return;
    }
    case 'references': {
      if (Array.isArray(value)) {
        const ids = value
          .map((v) => (v && typeof v === 'object' ? v.id : null))
          .filter((id) => typeof id === 'string')
          .join(', ');
        if (ids) {
          addStringMatch(ctx, ids, field.type, deepKey, labels);
        }
      }
      return;
    }
    case 'richtext': {
      walkRichText(
        ctx,
        field as schema.RichTextField,
        value as RichTextData,
        deepKey,
        labels
      );
      return;
    }
    default: {
      // Unknown field type — ignore.
      return;
    }
  }
}

/**
 * Walks a rich text value's blocks. Built-in blocks (paragraph, heading, etc.)
 * are searched by their text content. Custom blocks are walked using their
 * registered schema, so that matches inside them can deep-link into the rich
 * text and open the block's edit modal.
 */
function walkRichText(
  ctx: WalkContext,
  field: schema.RichTextField,
  data: RichTextData | null | undefined,
  deepKey: string,
  labels: string[]
) {
  if (!data || !Array.isArray(data.blocks)) {
    return;
  }
  const blockComponentSchemas = new Map<string, schema.Schema>();
  (field.blockComponents || []).forEach((s) => {
    if (s?.name) blockComponentSchemas.set(s.name, s);
  });

  // We track the index *among custom blocks only*, since the LexicalEditor
  // node tree only contains BlockComponentNodes for custom blocks (built-in
  // blocks like paragraph/heading/list are represented by their own native
  // lexical nodes, not BlockComponentNodes).
  let customBlockIndex = -1;
  data.blocks.forEach((block) => {
    if (!block?.type) {
      return;
    }
    if (NATIVE_LEXICAL_BLOCK_TYPES.has(block.type)) {
      walkBuiltInRichTextBlock(ctx, block, deepKey, labels);
      // Inline components within paragraph/heading blocks share the same edit
      // surface as the block itself, so matches there also map back to the
      // rich text field directly (no modal involved).
      return;
    }
    customBlockIndex += 1;
    const blockIndex = customBlockIndex;
    // Custom block component — walk its data using its schema, but record the
    // hit against the rich text field so deep-linking lands on the right
    // editor.
    const blockHit: RichTextHitInfo = {
      block: {richTextDeepKey: deepKey, blockIndex, blockName: block.type},
    };
    const blockSchema = blockComponentSchemas.get(block.type);
    if (!blockSchema) {
      // Unregistered block type. Best-effort: search any string values.
      walkUnknownObject(
        ctx,
        block.data,
        deepKey,
        [...labels, `${block.type} [block ${blockIndex}]`],
        blockHit
      );
      return;
    }
    const blockLabels = [
      ...labels,
      `${blockSchema.label || blockSchema.name} [block ${blockIndex}]`,
    ];
    walkRichTextBlockFields(
      ctx,
      blockSchema.fields || [],
      block.data || {},
      deepKey,
      blockLabels,
      blockHit
    );
  });
}

/**
 * Recursively walks a custom block's data, attributing every match to the
 * containing rich text field so the user can be jumped to the editor and have
 * the block's modal opened automatically.
 */
function walkRichTextBlockFields(
  ctx: WalkContext,
  fields: schema.Field[],
  data: Record<string, any>,
  deepKey: string,
  labels: string[],
  hitInfo: RichTextHitInfo
) {
  for (const field of fields) {
    if (!field.id || field.hidden) {
      continue;
    }
    const value = data?.[field.id];
    if (value === null || value === undefined) {
      continue;
    }
    const fieldLabels = [...labels, field.label || field.id];
    walkRichTextBlockField(ctx, field, value, deepKey, fieldLabels, hitInfo);
  }
}

function walkRichTextBlockField(
  ctx: WalkContext,
  field: schema.Field,
  value: any,
  deepKey: string,
  labels: string[],
  hitInfo: RichTextHitInfo
) {
  switch (field.type) {
    case 'object': {
      walkRichTextBlockFields(
        ctx,
        (field as schema.ObjectField).fields || [],
        value,
        deepKey,
        labels,
        hitInfo
      );
      return;
    }
    case 'array': {
      const arrayField = field as schema.ArrayField;
      const order: string[] = value?._array || [];
      order.forEach((arrayKey, index) => {
        const itemValue = value?.[arrayKey];
        if (itemValue === undefined || itemValue === null) return;
        walkRichTextBlockField(
          ctx,
          arrayField.of as schema.Field,
          itemValue,
          deepKey,
          [...labels, `[${index}]`],
          hitInfo
        );
      });
      return;
    }
    case 'oneof': {
      const oneOfField = field as schema.OneOfField;
      const selectedTypeName = value?._type;
      if (!selectedTypeName) return;
      const fieldTypes = oneOfField.types || [];
      let selectedSchema: schema.Schema | undefined;
      if (typeof (fieldTypes as any[])[0] === 'string') {
        if ((fieldTypes as string[]).includes(selectedTypeName)) {
          selectedSchema = ctx.types[selectedTypeName];
        }
      } else {
        selectedSchema = (fieldTypes as schema.Schema[]).find(
          (s) => s?.name === selectedTypeName
        );
      }
      if (selectedSchema) {
        walkRichTextBlockFields(
          ctx,
          selectedSchema.fields || [],
          value,
          deepKey,
          [...labels.slice(0, -1), `${labels.at(-1)} (${selectedTypeName})`],
          hitInfo
        );
      }
      return;
    }
    case 'string':
    case 'select': {
      if (typeof value === 'string') {
        addStringMatch(ctx, value, field.type, deepKey, labels, hitInfo);
      }
      return;
    }
    case 'multiselect': {
      if (Array.isArray(value)) {
        const joined = value.filter((v) => typeof v === 'string').join(', ');
        if (joined) {
          addStringMatch(ctx, joined, field.type, deepKey, labels, hitInfo);
        }
      }
      return;
    }
    case 'number': {
      if (typeof value === 'number') {
        addStringMatch(
          ctx,
          String(value),
          field.type,
          deepKey,
          labels,
          hitInfo
        );
      }
      return;
    }
    case 'image':
    case 'file': {
      if (value && typeof value === 'object') {
        const parts: string[] = [];
        if (typeof value.alt === 'string') parts.push(value.alt);
        if (typeof value.filename === 'string') parts.push(value.filename);
        if (typeof value.src === 'string') parts.push(value.src);
        if (parts.length > 0) {
          addStringMatch(
            ctx,
            parts.join(' '),
            field.type,
            deepKey,
            labels,
            hitInfo
          );
        }
      }
      return;
    }
    case 'richtext': {
      // Nested rich text inside a custom block — matches still land on the
      // outer rich text field and reopen the modal.
      walkRichText(
        ctx,
        field as schema.RichTextField,
        value as RichTextData,
        deepKey,
        labels
      );
      return;
    }
    default:
      return;
  }
}

/** Info about a rich text "container" used to route a search result. */
interface RichTextHitInfo {
  block?: NonNullable<DocSearchResult['richTextBlock']>;
  inline?: NonNullable<DocSearchResult['richTextInline']>;
}

/**
 * Walks an unknown object (used when a custom block's schema is not
 * registered, or when walking an inline component's data). Recursively
 * collects string values so they can still be matched.
 */
function walkUnknownObject(
  ctx: WalkContext,
  value: any,
  deepKey: string,
  labels: string[],
  hitInfo?: RichTextHitInfo
) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === 'string') {
    addStringMatch(ctx, value, 'string', deepKey, labels, hitInfo);
    return;
  }
  if (typeof value === 'number') {
    addStringMatch(ctx, String(value), 'number', deepKey, labels, hitInfo);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) =>
      walkUnknownObject(ctx, v, deepKey, [...labels, `[${i}]`], hitInfo)
    );
    return;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('_')) continue;
      walkUnknownObject(ctx, value[key], deepKey, [...labels, key], hitInfo);
    }
  }
}

/** Walks a built-in rich text block (paragraph, heading, list, etc.). */
function walkBuiltInRichTextBlock(
  ctx: WalkContext,
  block: RichTextBlock,
  deepKey: string,
  labels: string[]
) {
  switch (block.type) {
    case 'heading':
    case 'paragraph': {
      const text = stripHtml(block.data?.text);
      if (text) {
        addStringMatch(ctx, text, 'richtext', deepKey, [...labels, block.type]);
      }
      walkInlineComponents(ctx, block.data?.components, deepKey, labels);
      return;
    }
    case 'orderedList':
    case 'unorderedList': {
      walkRichTextListItems(ctx, block.data?.items, deepKey, [
        ...labels,
        block.type,
      ]);
      return;
    }
    case 'table': {
      const rows: RichTextTableRow[] = block.data?.rows || [];
      rows.forEach((row, rowIdx) => {
        (row.cells || []).forEach((cell, cellIdx) => {
          (cell.blocks || []).forEach((cellBlock) => {
            if (NATIVE_LEXICAL_BLOCK_TYPES.has(cellBlock.type)) {
              walkBuiltInRichTextBlock(ctx, cellBlock, deepKey, [
                ...labels,
                `table [${rowIdx},${cellIdx}]`,
              ]);
            }
          });
        });
      });
      return;
    }
    default:
      return;
  }
}

function walkRichTextListItems(
  ctx: WalkContext,
  items: RichTextListItem[] | undefined,
  deepKey: string,
  labels: string[]
) {
  if (!items) return;
  items.forEach((item, idx) => {
    const text = stripHtml(item.content);
    if (text) {
      addStringMatch(ctx, text, 'richtext', deepKey, [...labels, `[${idx}]`]);
    }
    walkInlineComponents(ctx, item.components, deepKey, labels);
    walkRichTextListItems(ctx, item.items, deepKey, [...labels, `[${idx}]`]);
  });
}

function walkInlineComponents(
  ctx: WalkContext,
  components: RichTextInlineComponentsMap | undefined,
  deepKey: string,
  labels: string[]
) {
  if (!components) return;
  for (const componentId of Object.keys(components)) {
    const component = components[componentId];
    if (!component?.type) continue;
    const hitInfo: RichTextHitInfo = {
      inline: {
        richTextDeepKey: deepKey,
        componentId,
        componentName: component.type,
      },
    };
    walkUnknownObject(
      ctx,
      component?.data,
      deepKey,
      [...labels, `inline:${component.type}`],
      hitInfo
    );
  }
}

/**
 * Strips HTML tags from a string. Rich text paragraph/heading values may be
 * stored as serialized HTML; we want to search the visible text only.
 */
function stripHtml(input: string | undefined): string {
  if (!input) return '';
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tests if `text` matches `ctx.queryLower` and, if so, appends a result with
 * a snippet centered on the first match.
 */
function addStringMatch(
  ctx: WalkContext,
  text: string,
  fieldType: string,
  deepKey: string,
  labels: string[],
  hitInfo?: RichTextHitInfo
) {
  if (!text) return;
  const haystack = text.toLowerCase();
  const firstIndex = haystack.indexOf(ctx.queryLower);
  if (firstIndex === -1) {
    return;
  }
  const {snippet, matches} = buildSnippet(text, ctx.queryLower);
  ctx.results.push({
    deepKey,
    label: labels.join(' › '),
    snippet,
    matches,
    fieldType,
    richTextBlock: hitInfo?.block,
    richTextInline: hitInfo?.inline,
  });
}

/**
 * Builds a snippet around the first match, with all matches highlighted within
 * the snippet window.
 */
function buildSnippet(
  text: string,
  queryLower: string
): {snippet: string; matches: Array<{start: number; end: number}>} {
  const haystack = text.toLowerCase();
  const queryLen = queryLower.length;
  const firstIndex = haystack.indexOf(queryLower);
  if (firstIndex === -1) {
    return {snippet: text, matches: []};
  }
  const start = Math.max(0, firstIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(
    text.length,
    firstIndex + queryLen + SNIPPET_CONTEXT_CHARS
  );
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const window = text.slice(start, end);
  const snippet = `${prefix}${window}${suffix}`;
  // Recompute match offsets relative to the snippet.
  const matches: Array<{start: number; end: number}> = [];
  const windowLower = window.toLowerCase();
  let cursor = 0;
  while (cursor < windowLower.length) {
    const idx = windowLower.indexOf(queryLower, cursor);
    if (idx === -1) break;
    matches.push({
      start: idx + prefix.length,
      end: idx + prefix.length + queryLen,
    });
    cursor = idx + queryLen;
  }
  return {snippet, matches};
}
