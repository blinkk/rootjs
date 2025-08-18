import {isObject} from './objects.js';

export type RichTextBlock =
  | RichTextParagraphBlock
  | RichTextHeadingBlock
  | RichTextListBlock
  | RichTextImageBlock
  | RichTextHtmlBlock
  | RichTextCustomBlock;

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
 * Modifies the `time` property of any nested `RichTextData` within a data
 * object. Updated `time` properties ensure that the RichTextEditor component
 * rerenders.
 */
export function updateRichTextDataTime(data: Record<string, any>) {
  if (testValidRichTextData(data)) {
    data.time = Date.now();
  }
  if (isObject(data)) {
    for (const key in data) {
      if (Object.hasOwn(data, key)) {
        updateRichTextDataTime(data[key]);
      }
    }
  } else if (Array.isArray(data)) {
    data.forEach((item) => updateRichTextDataTime(item));
  }
  return data;
}
