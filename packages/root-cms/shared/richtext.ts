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
   * CSS font size used to preview this size inside the CMS editor, e.g.
   * `0.875em`. It never reaches the published page, which is styled by the
   * site's own CSS for `<p data-size="...">`; it exists so that picking a size
   * visibly changes the text the editor is looking at. Omit it and the size
   * still works, but the editor previews it at the normal size.
   */
  fontSize?: string;
}

/** A paragraph size option with its label resolved. */
export interface ResolvedRichTextParagraphSize {
  value: RichTextParagraphSize;
  label: string;
  fontSize?: string;
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
    const fontSize = option.fontSize?.trim();
    if (fontSize) {
      resolved.fontSize = fontSize;
    }
    options.push(resolved);
  }
  return options;
}

/**
 * Builds the size-to-font-size map that the editor theme uses to preview
 * paragraph sizes. Sizes without a `fontSize` are omitted, and preview at the
 * normal size.
 */
export function getRichTextParagraphFontSizes(
  paragraphSizes?: Array<RichTextParagraphSizeOption | string> | null
): Record<string, string> {
  const fontSizes: Record<string, string> = {};
  for (const option of normalizeRichTextParagraphSizes(paragraphSizes)) {
    if (option.fontSize) {
      fontSizes[option.value] = option.fontSize;
    }
  }
  return fontSizes;
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
