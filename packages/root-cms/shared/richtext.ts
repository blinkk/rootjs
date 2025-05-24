import {isObject} from './objects.js';

export type RichTextBlock = RichTextParagraphBlock | RichTextHeadingBlock | RichTextListBlock | RichTextImageBlock | RichTextHtmlBlock | RichTextCustomBlock;

export interface RichTextParagraphBlock {
  type: 'paragraph';
  data?: {
    text?: string;
  };
}

export interface RichTextHeadingBlock {
  type: 'heading';
  data?: {
    level?: number;
    text?: string;
  };
}

export interface RichTextListItem {
  content?: string;
  itemsType?: 'orderedList' | 'unorderedList';
  items?: RichTextListItem[];
}

export interface RichTextListBlock {
  type: 'orderedList' | 'unorderedList';
  data?: {
    style?: 'ordered' | 'unordered';
    items?: RichTextListItem[];
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
  [key: string]: any;
  blocks: RichTextBlock[];
}

export function testValidRichTextData(data: RichTextData) {
  return isObject(data) && Array.isArray(data.blocks) && data.blocks.length > 0;
}
