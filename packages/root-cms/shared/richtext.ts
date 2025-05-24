import {isObject} from './objects.js';

export interface RichTextBlock {
  type: string;
  data?: any;
}

export interface RichTextData {
  [key: string]: any;
  blocks: any[];
}

export function testValidRichTextData(data: RichTextData) {
  return isObject(data) && Array.isArray(data.blocks) && data.blocks.length > 0;
}
