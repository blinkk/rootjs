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

export interface RichTextParagraphBlock {
  type: 'paragraph';
  data?: {
    text?: string;
    components?: RichTextInlineComponentsMap;
  };
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
