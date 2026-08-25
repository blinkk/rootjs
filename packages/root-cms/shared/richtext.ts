import {isObject} from './objects.js';

export type RichTextBlock =
  | RichTextParagraphBlock
  | RichTextHeadingBlock
  | RichTextListBlock
  | RichTextTableBlock
  | RichTextImageBlock
  | RichTextHtmlBlock
  | RichTextCustomBlock;

export interface RichTextInlineComponent {
  type: string;
  data?: Record<string, any>;
}

export type RichTextInlineComponentsMap = Record<
  string,
  RichTextInlineComponent
>;

/**
 * Identifier for a paragraph size variant, e.g. `small` or `large`. Sites
 * choose their own values and declare them per field via the richtext field's
 * `paragraphSizes` option; the CMS only stores and round-trips them. The
 * absence of a size means the site's default body size, so existing content
 * requires no migration.
 */
export type RichTextParagraphSize = string;

/**
 * A paragraph size variant offered in the rich text block type dropdown.
 */
export interface RichTextParagraphSizeOption {
  /** Stored on the block and rendered as `<p data-size="...">`. */
  value: RichTextParagraphSize;
  /** Label shown in the editor's dropdown. Defaults to `value`. */
  label?: string;
  /**
   * How the CMS editor should approximate this size. Editor-only: none of it
   * reaches the published page, which carries `data-size` alone and is styled
   * by the site's own CSS. It exists so that picking a size visibly changes
   * the text the editor is looking at. Omit it and the size still works, but
   * the editor previews it at the normal size.
   */
  editorStyle?: RichTextParagraphSizeEditorStyle;
}

/**
 * Typography used to preview a paragraph size in the CMS editor. Deliberately
 * limited to the properties that describe a body size variant: anything that
 * would make the editor misrepresent the content (colors, layout, visibility)
 * is out of scope.
 */
export interface RichTextParagraphSizeEditorStyle {
  /** e.g. `0.875em`. */
  fontSize?: string;
  /** e.g. `1.4` or `1.4em`. */
  lineHeight?: string | number;
  /** e.g. `500` or `bold`. */
  fontWeight?: string | number;
}

/** A paragraph size option with its label resolved. */
export interface ResolvedRichTextParagraphSize {
  value: RichTextParagraphSize;
  label: string;
  editorStyle?: RichTextParagraphSizeEditorStyle;
}

export interface RichTextParagraphBlock {
  type: 'paragraph';
  data?: {
    /**
     * Optional size variant, rendered as a `data-size` attribute on the `<p>`.
     * Sites decide what each size means in their own CSS.
     */
    size?: RichTextParagraphSize;
    text?: string;
    components?: RichTextInlineComponentsMap;
  };
}

/**
 * Returns a usable paragraph size, or `undefined` when the value is missing or
 * not a non-empty string. Used to guard values coming from stored documents,
 * which the CMS never validates against a site's declared sizes.
 */
export function parseRichTextParagraphSize(
  value: unknown
): RichTextParagraphSize | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const size = value.trim();
  return size || undefined;
}

/**
 * Expands a field's `paragraphSizes` option into a uniform list of options,
 * defaulting each label to its value.
 *
 * ```ts
 * normalizeRichTextParagraphSizes(['small', {value: 'large', label: 'Larger'}]);
 * // [{value: 'small', label: 'small'}, {value: 'large', label: 'Larger'}]
 * ```
 */
export function normalizeRichTextParagraphSizes(
  paragraphSizes?: Array<RichTextParagraphSizeOption | string> | null
): ResolvedRichTextParagraphSize[] {
  if (!paragraphSizes) {
    return [];
  }
  const options: ResolvedRichTextParagraphSize[] = [];
  for (const option of paragraphSizes) {
    const value = parseRichTextParagraphSize(
      typeof option === 'string' ? option : option?.value
    );
    if (!value) {
      continue;
    }
    if (typeof option === 'string') {
      options.push({value, label: value});
      continue;
    }
    const resolved: ResolvedRichTextParagraphSize = {
      value,
      label: option.label?.trim() || value,
    };
    const editorStyle = normalizeParagraphSizeEditorStyle(option.editorStyle);
    if (editorStyle) {
      resolved.editorStyle = editorStyle;
    }
    options.push(resolved);
  }
  return options;
}

const EDITOR_STYLE_PROPS = ['fontSize', 'lineHeight', 'fontWeight'] as const;

/**
 * Keeps the supported editor style properties that hold a usable value, and
 * returns `undefined` when none do. Guards against unknown properties reaching
 * the editor DOM.
 */
function normalizeParagraphSizeEditorStyle(
  editorStyle?: RichTextParagraphSizeEditorStyle | null
): RichTextParagraphSizeEditorStyle | undefined {
  if (!editorStyle) {
    return undefined;
  }
  const normalized: RichTextParagraphSizeEditorStyle = {};
  let hasValue = false;
  for (const prop of EDITOR_STYLE_PROPS) {
    const value = editorStyle[prop];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[prop] = value as never;
      hasValue = true;
    } else if (typeof value === 'string' && value.trim()) {
      normalized[prop] = value.trim() as never;
      hasValue = true;
    }
  }
  return hasValue ? normalized : undefined;
}

/**
 * Builds the size-to-style map that the editor theme uses to preview paragraph
 * sizes. Sizes without an `editorStyle` are omitted, and preview at the normal
 * size.
 */
export function getRichTextParagraphEditorStyles(
  paragraphSizes?: Array<RichTextParagraphSizeOption | string> | null
): Record<string, RichTextParagraphSizeEditorStyle> {
  const styles: Record<string, RichTextParagraphSizeEditorStyle> = {};
  for (const option of normalizeRichTextParagraphSizes(paragraphSizes)) {
    if (option.editorStyle) {
      styles[option.value] = option.editorStyle;
    }
  }
  return styles;
}

/**
 * Returns whether any paragraph in the value carries a size, including
 * paragraphs nested inside table cells.
 *
 * A field can hold sized paragraphs without declaring `paragraphSizes` (they
 * can be pasted in from a field that does, and a site's CSS is global rather
 * than per field), so the stored value — not just the schema — decides whether
 * sizes need protecting.
 */
export function testRichTextParagraphSizes(
  data?: RichTextData | null
): boolean {
  return testBlocksHaveParagraphSize(data?.blocks);
}

function testBlocksHaveParagraphSize(blocks?: RichTextBlock[]): boolean {
  if (!blocks) {
    return false;
  }
  for (const block of blocks) {
    if (
      block.type === 'paragraph' &&
      parseRichTextParagraphSize((block.data as {size?: unknown})?.size)
    ) {
      return true;
    }
    if (block.type === 'table') {
      const rows: RichTextTableRow[] =
        (block.data as RichTextTableBlock['data'])?.rows || [];
      for (const row of rows) {
        for (const cell of row.cells || []) {
          if (testBlocksHaveParagraphSize(cell.blocks)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export interface RichTextHeadingBlock {
  type: 'heading';
  data?: {
    level?: number;
    text?: string;
    components?: RichTextInlineComponentsMap;
  };
}

export interface RichTextListItem {
  content?: string;
  itemsType?: 'orderedList' | 'unorderedList';
  items?: RichTextListItem[];
  components?: RichTextInlineComponentsMap;
}

export interface RichTextListBlock {
  type: 'orderedList' | 'unorderedList';
  data?: {
    style?: 'ordered' | 'unordered';
    items?: RichTextListItem[];
  };
}

export interface RichTextTableCell {
  blocks: RichTextBlock[];
  type: 'header' | 'data';
}

export interface RichTextTableRow {
  cells: RichTextTableCell[];
}

export interface RichTextTableBlock {
  type: 'table';
  data?: {
    rows?: RichTextTableRow[];
  };
}

export interface RichTextImageBlock {
  type: 'image';
  data?: {
    file?: {
      url: string;
      width: string | number;
      height: string | number;
      alt: string;
    };
  };
}

export interface RichTextHtmlBlock {
  type: 'html';
  data?: {
    html?: string;
  };
}

export interface RichTextCustomBlock<TypeName = string, DataType = any> {
  type: TypeName;
  data?: DataType;
}

export interface RichTextData {
  blocks: RichTextBlock[];
  time: number;
  version: string;
}

export function testValidRichTextData(data: RichTextData | unknown) {
  return (
    isObject(data) &&
    Array.isArray((data as Record<string, any>).blocks) &&
    (data as Record<string, any>).blocks.length > 0
  );
}

/**
 * Returns true if two rich text values hold the same content.
 *
 * Only `blocks` are compared: `time` and `version` are editor bookkeeping that
 * change on every save and say nothing about what the user sees. Editors use
 * this to decide whether an incoming value is an echo of their own last change
 * (ignore it, so the cursor isn't reset on every keystroke) or an external
 * replacement they need to re-render (e.g. "discard draft edits", which
 * restores published content whose `time` is older than the draft's).
 *
 * The keystroke path exits on reference equality: an editor's own value is
 * handed back to it by the same object, so the deep walk only runs for values
 * that arrived from somewhere else (the db, undo/redo, a revert).
 */
export function testSameRichTextContent(
  a?: RichTextData | null,
  b?: RichTextData | null
): boolean {
  return testSameJsonValue(getRichTextBlocks(a), getRichTextBlocks(b));
}

/** Returns a rich text value's blocks, or an empty list if it has none. */
function getRichTextBlocks(data?: RichTextData | null): RichTextBlock[] {
  if (!isObject(data) || !Array.isArray((data as RichTextData).blocks)) {
    return [];
  }
  return (data as RichTextData).blocks;
}

/**
 * Deep-compares two JSON-like values. `null` and `undefined` are treated as
 * equivalent, since a value that round-trips through firestore loses its
 * `undefined` keys.
 */
function testSameJsonValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => testSameJsonValue(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    for (const key of Object.keys(aObj)) {
      if (!testSameJsonValue(aObj[key], bObj[key])) {
        return false;
      }
    }
    // A key only `b` has matches a's missing (i.e. `undefined`) value only when
    // it's empty itself. Key counts can't stand in for this check: `a` and `b`
    // can hold the same number of keys and still not hold the same ones.
    for (const key of Object.keys(bObj)) {
      if (!(key in aObj) && !testSameJsonValue(undefined, bObj[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
