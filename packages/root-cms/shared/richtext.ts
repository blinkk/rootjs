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
): Array<Required<RichTextParagraphSizeOption>> {
  if (!paragraphSizes) {
    return [];
  }
  const options: Array<Required<RichTextParagraphSizeOption>> = [];
  for (const option of paragraphSizes) {
    const value = parseRichTextParagraphSize(
      typeof option === 'string' ? option : option?.value
    );
    if (!value) {
      continue;
    }
    const label =
      typeof option === 'string'
        ? undefined
        : option.label?.trim() || undefined;
    options.push({value, label: label || value});
  }
  return options;
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
